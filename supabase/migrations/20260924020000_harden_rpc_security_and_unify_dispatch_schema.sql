-- =====================================================================
-- Migration: 20260924020000_harden_rpc_security_and_unify_dispatch_schema.sql
-- Description:
-- 1. Unificación de Foreign Key e inconsistencias en dispatch_offers:
--    - Re-apunta dispatch_offers(dispatch_request_id) a public.pharmacy_dispatch_requests(id)
--    - Añade columnas de interoperabilidad call_id, guest_invite_id y price_brl a pharmacy_dispatch_requests
--    - Actualiza match_dispatch_doctors para consumir de pharmacy_dispatch_requests por tier_requested
--    - Actualiza claim_dispatch_offer para actualizar pharmacy_dispatch_requests (status='matched', assigned_doctor_id)
-- 2. Mitigación P0 de Vulnerabilidad de Caller Identity en RPCs SECURITY DEFINER:
--    - set_doctor_duty_status
--    - finish_pharmacy_consultation
--    - claim_pharmacy_request_tier
--    - doctor_heartbeat
--    - Revoca privilegios de ejecución para el rol anon
-- 3. Creación auditable de calls y call_guest_invites en claim_pharmacy_request_tier
-- 4. RLS para Kioscos físicos en pharmacy_dispatch_requests (permitir inserts anónimos con status='searching' y DNI/CPF)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. UNIFICACIÓN DE ESQUEMA Y FOREIGN KEY EN DISPATCH_OFFERS
-- ---------------------------------------------------------------------

-- 1.1 Asegurar columnas necesarias en public.pharmacy_dispatch_requests
ALTER TABLE public.pharmacy_dispatch_requests
    ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS guest_invite_id UUID REFERENCES public.call_guest_invites(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS price_brl NUMERIC(6,2);

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_requests_call_id
    ON public.pharmacy_dispatch_requests (call_id)
    WHERE call_id IS NOT NULL;

-- 1.2 Corregir Foreign Key en dispatch_offers para apuntar canónicamente a pharmacy_dispatch_requests
ALTER TABLE public.dispatch_offers
    DROP CONSTRAINT IF EXISTS dispatch_offers_dispatch_request_id_fkey;

ALTER TABLE public.dispatch_offers
    ADD CONSTRAINT dispatch_offers_dispatch_request_id_fkey
    FOREIGN KEY (dispatch_request_id)
    REFERENCES public.pharmacy_dispatch_requests(id)
    ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- 2. RLS PARA KIOSCOS EN PHARMACY_DISPATCH_REQUESTS
-- ---------------------------------------------------------------------

-- Reemplazar política de inserción para permitir kioscos anónimos de farmacia
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_insert_owner" ON public.pharmacy_dispatch_requests;
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_insert_kiosk_or_owner" ON public.pharmacy_dispatch_requests;

CREATE POLICY "pharmacy_dispatch_requests_insert_kiosk_or_owner"
    ON public.pharmacy_dispatch_requests FOR INSERT
    TO anon, authenticated, service_role
    WITH CHECK (
        auth.role() = 'service_role'
        OR (auth.uid() IS NOT NULL AND requested_by_user_id = auth.uid())
        OR (
            status = 'searching'
            AND (patient_dni IS NOT NULL OR patient_cpf IS NOT NULL)
        )
    );

-- ---------------------------------------------------------------------
-- 3. VULNERABILIDAD P0 EN RPCS: CALLER IDENTITY & SECURITY DEFINER
-- ---------------------------------------------------------------------

-- 3.1 public.set_doctor_duty_status
DROP FUNCTION IF EXISTS public.set_doctor_duty_status(UUID, BOOLEAN, public.dispatch_tier_category[]);

CREATE OR REPLACE FUNCTION public.set_doctor_duty_status(
    p_doctor_id UUID,
    p_is_on_duty BOOLEAN,
    p_active_tiers public.dispatch_tier_category[] DEFAULT '{general}'::public.dispatch_tier_category[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_resolved_doc_id UUID;
    v_doctor_user_id UUID;
BEGIN
    -- Resolver doctor canónico (id = p_doctor_id OR user_id = p_doctor_id)
    SELECT id, user_id INTO v_resolved_doc_id, v_doctor_user_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_resolved_doc_id IS NULL THEN
        v_resolved_doc_id := p_doctor_id;
    END IF;

    -- Validar Caller Identity: solo service_role o el propio médico autenticado
    IF auth.role() != 'service_role' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_resolved_doc_id) != auth.uid()) THEN
        RAISE EXCEPTION 'No autorizado para modificar guardia de este médico' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.doctor_duty_status (
        doctor_id,
        is_on_duty,
        active_tiers,
        duty_started_at,
        current_active_request_id,
        last_heartbeat_at,
        updated_at
    )
    VALUES (
        v_resolved_doc_id,
        p_is_on_duty,
        p_active_tiers,
        CASE WHEN p_is_on_duty THEN NOW() ELSE NULL END,
        NULL,
        NOW(),
        NOW()
    )
    ON CONFLICT (doctor_id) DO UPDATE
    SET is_on_duty = EXCLUDED.is_on_duty,
        active_tiers = EXCLUDED.active_tiers,
        duty_started_at = CASE 
            WHEN EXCLUDED.is_on_duty AND NOT public.doctor_duty_status.is_on_duty THEN NOW() 
            WHEN NOT EXCLUDED.is_on_duty THEN NULL
            ELSE public.doctor_duty_status.duty_started_at 
        END,
        -- Si desactiva la guardia, liberar cualquier solicitud activa inmediatamente
        current_active_request_id = CASE
            WHEN NOT EXCLUDED.is_on_duty THEN NULL
            ELSE public.doctor_duty_status.current_active_request_id
        END,
        last_heartbeat_at = NOW(),
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'doctor_id', v_resolved_doc_id,
        'is_on_duty', p_is_on_duty,
        'active_tiers', p_active_tiers
    );
END;
$$;

-- 3.2 public.finish_pharmacy_consultation
DROP FUNCTION IF EXISTS public.finish_pharmacy_consultation(UUID, UUID);

CREATE OR REPLACE FUNCTION public.finish_pharmacy_consultation(
    p_doctor_id UUID,
    p_request_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_resolved_doc_id UUID;
    v_target_request_id UUID := p_request_id;
BEGIN
    -- Resolver doctor canónico (id = p_doctor_id OR user_id = p_doctor_id)
    SELECT id INTO v_resolved_doc_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_resolved_doc_id IS NULL THEN
        v_resolved_doc_id := p_doctor_id;
    END IF;

    -- Validar Caller Identity: solo service_role o el propio médico autenticado
    IF auth.role() != 'service_role' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_resolved_doc_id) != auth.uid()) THEN
        RAISE EXCEPTION 'No autorizado para finalizar consulta de este médico' USING ERRCODE = '42501';
    END IF;

    -- Si no se proporcionó p_request_id, obtener el request activo del médico
    IF v_target_request_id IS NULL THEN
        SELECT current_active_request_id INTO v_target_request_id
        FROM public.doctor_duty_status
        WHERE doctor_id = v_resolved_doc_id;
    END IF;

    -- Cerrar la solicitud en pharmacy_dispatch_requests
    IF v_target_request_id IS NOT NULL THEN
        UPDATE public.pharmacy_dispatch_requests
        SET status = 'completed',
            call_ended_at = COALESCE(call_ended_at, NOW())
        WHERE id = v_target_request_id;

        -- Actualizar también en pharmacy_consultation_requests para retrocompatibilidad
        UPDATE public.pharmacy_consultation_requests
        SET status = 'completed',
            completed_at = COALESCE(completed_at, NOW())
        WHERE id = v_target_request_id;
    END IF;

    -- Liberar guardia médica incondicionalmente
    UPDATE public.doctor_duty_status
    SET current_active_request_id = NULL,
        updated_at = NOW()
    WHERE doctor_id = v_resolved_doc_id;

    RETURN jsonb_build_object(
        'success', true,
        'doctor_id', v_resolved_doc_id,
        'request_id', v_target_request_id,
        'message', 'Guardia liberada y consulta finalizada exitosamente.'
    );
END;
$$;

-- 3.3 public.claim_pharmacy_request_tier
-- Resolver orden de parámetros para PostgREST y llamadas posicionales (p_doctor_id, p_request_id)
DROP FUNCTION IF EXISTS public.claim_pharmacy_request_tier(UUID, UUID);

CREATE OR REPLACE FUNCTION public.claim_pharmacy_request_tier(
    p_doctor_id UUID,
    p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_duty RECORD;
    v_prev_req RECORD;
    v_resolved_doc_id UUID;
    v_call_id UUID;
    v_guest_invite_id UUID;
BEGIN
    -- Resolver ID canónico del doctor (por id o por user_id)
    SELECT id INTO v_resolved_doc_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_resolved_doc_id IS NULL THEN
        v_resolved_doc_id := p_doctor_id;
    END IF;

    -- Validar Caller Identity: solo service_role o el propio médico autenticado
    IF auth.role() != 'service_role' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_resolved_doc_id) != auth.uid()) THEN
        RAISE EXCEPTION 'No autorizado para tomar consulta para este médico' USING ERRCODE = '42501';
    END IF;

    -- 1. Validar estado de guardia del médico
    SELECT * INTO v_duty
    FROM public.doctor_duty_status
    WHERE (doctor_id = v_resolved_doc_id OR doctor_id = p_doctor_id)
      AND is_on_duty = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DOCTOR_NOT_ON_DUTY',
            'message', 'Debes activar tu estado En Servicio para tomar consultas.'
        );
    END IF;

    -- 2. Inspección y Self-Healing de bloqueo previo
    IF v_duty.current_active_request_id IS NOT NULL THEN
        SELECT id, status, matched_at, call_started_at, call_ended_at, created_at
        INTO v_prev_req
        FROM public.pharmacy_dispatch_requests
        WHERE id = v_duty.current_active_request_id;

        -- Evaluar si el bloqueo anterior es zombie/huérfano:
        -- a) No existe el registro
        -- b) La consulta previa ya está finalizada, cancelada o expirada
        -- c) Match abandonado: fue asignada hace más de 60 segundos pero el video nunca inició
        -- d) Consulta excedió el tiempo máximo de seguridad (60 minutos)
        IF v_prev_req.id IS NULL 
           OR v_prev_req.status IN ('completed', 'cancelled', 'expired')
           OR (v_prev_req.status = 'matched' AND v_prev_req.call_started_at IS NULL AND v_prev_req.matched_at < NOW() - INTERVAL '60 seconds')
           OR (v_prev_req.matched_at < NOW() - INTERVAL '60 minutes')
        THEN
            -- Auto-sanar: Si la consulta anterior quedó en 'matched', cancelarla por abandono
            IF v_prev_req.id IS NOT NULL AND v_prev_req.status = 'matched' THEN
                UPDATE public.pharmacy_dispatch_requests
                SET status = 'cancelled',
                    call_ended_at = NOW()
                WHERE id = v_prev_req.id;
            END IF;

            -- Liberar al médico del bloqueo zombie
            UPDATE public.doctor_duty_status
            SET current_active_request_id = NULL,
                updated_at = NOW()
            WHERE doctor_id = v_duty.doctor_id;

            v_duty.current_active_request_id := NULL;
        ELSE
            -- El médico está efectivamente en una videollamada activa y legítima
            RETURN jsonb_build_object(
                'success', false,
                'code', 'DOCTOR_ALREADY_IN_CALL',
                'message', 'Ya tienes una consulta activa en curso. Finalízala antes de aceptar otra.'
            );
        END IF;
    END IF;

    -- 3. Bloquear la solicitud con SKIP LOCKED verificando SLA y vigencia
    SELECT * INTO v_req
    FROM public.pharmacy_dispatch_requests
    WHERE id = p_request_id
      AND status = 'searching'
      AND (search_timeout_at IS NULL OR search_timeout_at > NOW())
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        -- Verificar si expiró para actualizar su estado de forma limpia
        UPDATE public.pharmacy_dispatch_requests
        SET status = 'expired'
        WHERE id = p_request_id
          AND status = 'searching'
          AND search_timeout_at <= NOW();

        RETURN jsonb_build_object(
            'success', false,
            'code', 'REQUEST_ALREADY_CLAIMED_OR_EXPIRED',
            'message', 'La consulta ya fue asignada a otro colega o expiró el SLA.'
        );
    END IF;

    -- 4. Validar compatibilidad de Tier
    IF v_duty.active_tiers IS NOT NULL AND array_length(v_duty.active_tiers, 1) > 0 THEN
        IF NOT (v_req.tier_requested = ANY(v_duty.active_tiers) OR 'general' = ANY(v_duty.active_tiers)) THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'TIER_MISMATCH',
                'message', 'Esta consulta requiere una especialidad no configurada en tu guardia activa.'
            );
        END IF;
    END IF;

    -- 5. Creación auditable de calls y call_guest_invites para interoperabilidad completa
    SELECT id INTO v_call_id
    FROM public.calls
    WHERE room_id = v_req.cloudflare_room_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_call_id IS NULL THEN
        INSERT INTO public.calls (doctor_id, patient_id, room_id, status)
        VALUES (v_resolved_doc_id, v_req.patient_id, v_req.cloudflare_room_id, 'requested')
        RETURNING id INTO v_call_id;
    ELSE
        UPDATE public.calls
        SET doctor_id = v_resolved_doc_id,
            patient_id = COALESCE(patient_id, v_req.patient_id),
            status = 'requested'
        WHERE id = v_call_id;
    END IF;

    SELECT id INTO v_guest_invite_id
    FROM public.call_guest_invites
    WHERE call_id = v_call_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_guest_invite_id IS NULL THEN
        INSERT INTO public.call_guest_invites (call_id, room_id, guest_name, expires_at)
        VALUES (
            v_call_id,
            v_req.cloudflare_room_id,
            COALESCE(v_req.patient_name, 'Paciente Farmacia'),
            NOW() + INTERVAL '24 hours'
        )
        RETURNING id INTO v_guest_invite_id;
    END IF;

    -- 6. Adjudicación atómica al médico en pharmacy_dispatch_requests
    UPDATE public.pharmacy_dispatch_requests
    SET assigned_doctor_id = v_resolved_doc_id,
        call_id = v_call_id,
        guest_invite_id = v_guest_invite_id,
        status = 'matched',
        matched_at = NOW()
    WHERE id = p_request_id;

    -- 7. Marcar al médico ocupado en guardia
    UPDATE public.doctor_duty_status
    SET current_active_request_id = p_request_id,
        updated_at = NOW()
    WHERE doctor_id = v_duty.doctor_id;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'MATCH_SUCCESSFUL',
        'request_id', v_req.id,
        'cloudflare_room_id', v_req.cloudflare_room_id,
        'call_id', v_call_id,
        'guest_invite_id', v_guest_invite_id,
        'patient_dni', v_req.patient_dni,
        'patient_phone', v_req.patient_phone,
        'tier_requested', v_req.tier_requested
    );
END;
$$;

-- 3.4 public.doctor_heartbeat
CREATE OR REPLACE FUNCTION public.doctor_heartbeat(p_doctor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doctor_id UUID;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1.1 Resuelve el doctor canónico (id = p_doctor_id OR user_id = p_doctor_id)
    SELECT id INTO v_doctor_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_doctor_id IS NULL THEN
        v_doctor_id := p_doctor_id;
    END IF;

    -- Validar Caller Identity: solo service_role o el propio médico autenticado
    IF auth.role() != 'service_role' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_doctor_id) != auth.uid()) THEN
        RAISE EXCEPTION 'No autorizado para emitir heartbeat de este médico' USING ERRCODE = '42501';
    END IF;

    -- 1.2 Actualiza doctor_duty_status si está en guardia
    UPDATE public.doctor_duty_status
    SET last_heartbeat_at = v_now,
        updated_at = v_now
    WHERE doctor_id = v_doctor_id
      AND is_on_duty = true;

    -- 1.3 Actualiza doctor_on_duty_sessions activas
    UPDATE public.doctor_on_duty_sessions
    SET last_heartbeat_at = v_now
    WHERE doctor_id = v_doctor_id
      AND status = 'active';

    -- 1.4 Retorna resultado exitoso
    RETURN jsonb_build_object(
        'success', true,
        'timestamp', v_now
    );
END;
$$;

-- 3.5 Endurecer Permisos de Ejecución: Revocar anon y Conceder authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.claim_pharmacy_request_tier(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finish_pharmacy_consultation(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_doctor_duty_status(UUID, BOOLEAN, public.dispatch_tier_category[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.doctor_heartbeat(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.claim_pharmacy_request_tier(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finish_pharmacy_consultation(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_doctor_duty_status(UUID, BOOLEAN, public.dispatch_tier_category[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.doctor_heartbeat(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. ACTUALIZACIÓN DE MATCHING Y DISPATCH OFFERS
-- ---------------------------------------------------------------------

-- 4.1 public.match_dispatch_doctors
-- Busca médicos on-duty con heartbeat reciente basándose en pharmacy_dispatch_requests y tier_requested
CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_tier TEXT;
  v_price NUMERIC(6,2);
  v_result JSONB;
BEGIN
  -- 1. Obtener datos de la solicitud de despacho
  SELECT * INTO v_req 
  FROM public.pharmacy_dispatch_requests 
  WHERE id = p_dispatch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'dispatch_request_not_found');
  END IF;

  -- 2. Clasificar según tier_requested
  v_tier := CASE 
    WHEN v_req.tier_requested IN ('salud_mental') THEN 'psychiatry'
    WHEN v_req.tier_requested IN ('dermatologia', 'cardiologia', 'pediatria', 'traumatologia', 'salud_femenina', 'oftalmo_otorrino', 'neumonologia', 'gastroenterologia', 'urologia', 'endocrinologia') THEN 'specialist'
    ELSE 'basic'
  END;

  -- 3. Obtener precio configurado o usar fallback canónico
  SELECT price_brl INTO v_price 
  FROM public.ondemand_pricing 
  WHERE tier = v_tier;

  IF v_price IS NULL THEN
    v_price := CASE 
      WHEN v_tier = 'specialist' THEN 159.90
      WHEN v_tier = 'psychiatry' THEN 179.90
      ELSE 69.90
    END;
  END IF;

  -- 4. Limpiar ofertas previas expiradas para este dispatch
  DELETE FROM public.dispatch_offers 
  WHERE dispatch_request_id = p_dispatch_id 
    AND status = 'expired';
  
  -- 5. Buscar médicos on-duty con heartbeat reciente (> now() - 90s), disponibles y compatibles
  WITH inserted AS (
    INSERT INTO public.dispatch_offers (dispatch_request_id, doctor_id, offered_at, expires_at, status, price_brl)
    SELECT 
      p_dispatch_id,
      d.id,
      NOW(),
      NOW() + INTERVAL '30 seconds',
      'pending',
      v_price
    FROM public.doctors d
    JOIN public.doctor_duty_status dds ON dds.doctor_id = d.id
    WHERE (d.on_duty_pharmacy = true OR dds.is_on_duty = true)
      AND dds.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
      AND dds.current_active_request_id IS NULL
      AND (
        dds.active_tiers IS NULL 
        OR v_req.tier_requested = ANY(dds.active_tiers)
        OR 'general'::public.dispatch_tier_category = ANY(dds.active_tiers)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers doe
        WHERE doe.dispatch_request_id = p_dispatch_id
          AND doe.doctor_id = d.id
          AND doe.status = 'pending'
      )
    RETURNING id, doctor_id, offered_at, expires_at, status, price_brl
  )
  SELECT jsonb_build_object(
    'offers',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'doctor_id', doctor_id::text,
          'offered_at', offered_at,
          'expires_at', expires_at,
          'status', status,
          'price_brl', price_brl
        )
      ),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM inserted;
  
  IF v_result IS NULL OR (v_result->'offers') IS NULL OR jsonb_array_length(v_result->'offers') = 0 THEN
    RETURN '{}'::jsonb;
  END IF;
  
  RETURN v_result;
END;
$$;

-- 4.2 public.claim_dispatch_offer
-- Atómico: acepta la oferta, crea o enlaza calls/call_guest_invites, y actualiza pharmacy_dispatch_requests
CREATE OR REPLACE FUNCTION public.claim_dispatch_offer(p_offer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offer public.dispatch_offers%ROWTYPE;
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_resolved_doc_id UUID;
  v_call_id UUID;
  v_invite_id UUID;
  v_room_id TEXT;
BEGIN
  -- 1. Validar oferta existe y está pendiente con bloqueo de fila
  SELECT * INTO v_offer 
  FROM public.dispatch_offers 
  WHERE id = p_offer_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_found');
  END IF;
  
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_pending');
  END IF;
  
  IF v_offer.expires_at < NOW() THEN
    UPDATE public.dispatch_offers SET status = 'expired' WHERE id = p_offer_id;
    RETURN jsonb_build_object('success', false, 'error', 'offer_expired');
  END IF;

  -- Resolver ID del doctor
  SELECT id INTO v_resolved_doc_id
  FROM public.doctors
  WHERE id = v_offer.doctor_id OR user_id = v_offer.doctor_id
  LIMIT 1;

  IF v_resolved_doc_id IS NULL THEN
    v_resolved_doc_id := v_offer.doctor_id;
  END IF;

  -- Validar Caller Identity: solo service_role o el médico de la oferta
  IF auth.role() != 'service_role' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_resolved_doc_id) != auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para aceptar esta oferta' USING ERRCODE = '42501';
  END IF;
  
  -- 2. Marcar oferta como aceptada
  UPDATE public.dispatch_offers 
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = p_offer_id;

  -- Expirar otras ofertas concurrentes para este request
  UPDATE public.dispatch_offers
  SET status = 'expired'
  WHERE dispatch_request_id = v_offer.dispatch_request_id
    AND id <> p_offer_id
    AND status = 'pending';
  
  -- 3. Obtener y bloquear la solicitud en pharmacy_dispatch_requests
  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id = v_offer.dispatch_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'dispatch_request_not_found');
  END IF;

  v_room_id := COALESCE(v_req.cloudflare_room_id, 'room_pharm_' || floor(extract(epoch from now()))::bigint::text || '_' || substring(md5(random()::text) from 1 for 8));

  -- 4. Crear o enlazar llamada en calls
  SELECT id INTO v_call_id
  FROM public.calls
  WHERE room_id = v_room_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_call_id IS NULL THEN
    INSERT INTO public.calls (doctor_id, patient_id, room_id, status)
    VALUES (v_resolved_doc_id, v_req.patient_id, v_room_id, 'requested')
    RETURNING id INTO v_call_id;
  ELSE
    UPDATE public.calls
    SET doctor_id = v_resolved_doc_id,
        patient_id = COALESCE(patient_id, v_req.patient_id),
        status = 'requested'
    WHERE id = v_call_id;
  END IF;
   
  -- 5. Crear o reutilizar invitación de invitado
  SELECT id INTO v_invite_id
  FROM public.call_guest_invites
  WHERE call_id = v_call_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite_id IS NULL THEN
    INSERT INTO public.call_guest_invites (call_id, room_id, guest_name, expires_at)
    VALUES (v_call_id, v_room_id, COALESCE(v_req.patient_name, 'Paciente Farmacia'), NOW() + INTERVAL '24 hours')
    RETURNING id INTO v_invite_id;
  END IF;
   
  -- 6. Actualizar solicitud en public.pharmacy_dispatch_requests atómicamente
  UPDATE public.pharmacy_dispatch_requests
  SET 
    assigned_doctor_id = v_resolved_doc_id,
    call_id = v_call_id,
    guest_invite_id = v_invite_id,
    status = 'matched',
    matched_at = NOW(),
    price_brl = v_offer.price_brl
  WHERE id = v_offer.dispatch_request_id;

  -- 7. Marcar médico ocupado en doctor_duty_status
  UPDATE public.doctor_duty_status
  SET current_active_request_id = v_offer.dispatch_request_id,
      updated_at = NOW()
  WHERE doctor_id = v_resolved_doc_id;
   
  -- 8. Retornar resultado con datos completos
  RETURN jsonb_build_object(
    'success', true,
    'requestId', v_offer.dispatch_request_id::text,
    'callId', v_call_id::text,
    'roomId', v_room_id,
    'guestInviteId', v_invite_id::text,
    'doctorId', v_resolved_doc_id::text,
    'patientName', v_req.patient_name,
    'patientDni', v_req.patient_dni,
    'priceBrl', v_offer.price_brl,
    'assignedAt', NOW()
  );
   
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.match_dispatch_doctors(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_dispatch_offer(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.match_dispatch_doctors(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_dispatch_offer(UUID) TO authenticated, service_role;
