-- Offer-oriented doctor acceptance and privacy boundary for persistent AR/BR queue.
-- Replaces unsafe global searching visibility with owner / active exact offer / assigned doctor.
BEGIN;
CREATE OR REPLACE FUNCTION public.claim_pharmacy_request_tier(p_doctor_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_resolved_doc_id) IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'No autorizado para tomar consulta para este médico' USING ERRCODE = '42501';
    END IF;

    -- 1. Validar estado de guardia del médico
    SELECT * INTO v_duty
    FROM public.doctor_duty_status
    WHERE (doctor_id = v_resolved_doc_id OR doctor_id = p_doctor_id)
      AND is_on_duty = true
      AND last_heartbeat_at > NOW() - INTERVAL '90 seconds'
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

    -- A patient stays in their selected clinical jurisdiction. A physician
    -- can accept only an offer explicitly dispatched to their own doctor ID.
    IF NOT EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = v_resolved_doc_id
          AND d.active IS TRUE
          AND d.care_country = v_req.care_country
          AND app_private.is_doctor_dispatch_approved(d.id)
          AND NULLIF(btrim(d.license_number), '') IS NOT NULL
          AND upper(btrim(d.license_number)) !~ '^PENDING'
    ) THEN
        RETURN jsonb_build_object('success',false,'code','COUNTRY_OR_LICENSE_MISMATCH');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers o
        WHERE o.dispatch_request_id = p_request_id
          AND o.doctor_id = v_resolved_doc_id
          AND o.status = 'pending'
          AND o.expires_at > NOW()
    ) THEN
        RETURN jsonb_build_object('success',false,'code','VALID_OFFER_REQUIRED');
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

    -- Resolve the one-time offer when the doctor accepts. Other offers
    -- must not remain visible or be accepted after successful assignment.
    UPDATE public.dispatch_offers
    SET status = 'accepted', accepted_at = NOW()
    WHERE dispatch_request_id = p_request_id
      AND doctor_id = v_resolved_doc_id
      AND status = 'pending'
      AND expires_at > NOW();

    UPDATE public.dispatch_offers
    SET status = 'expired'
    WHERE dispatch_request_id = p_request_id
      AND doctor_id <> v_resolved_doc_id
      AND status = 'pending';

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
$function$;

CREATE OR REPLACE FUNCTION public.claim_dispatch_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- All callers (including service-role dispatchers) must be limited to an
  -- active practitioner with a non-provisional credential. Official license
  -- verification remains a separate administrative obligation.
  IF NOT EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.id = v_resolved_doc_id
      AND d.active IS TRUE
      AND app_private.is_doctor_dispatch_approved(d.id)
      AND NULLIF(btrim(d.license_number), '') IS NOT NULL
      AND upper(btrim(d.license_number)) !~ '^PENDING'
  ) THEN
    RAISE EXCEPTION 'doctor_not_clinically_eligible' USING ERRCODE = '42501';
  END IF;

  -- Never authorize from a client-supplied doctorId or mutable metadata.
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
    AND NOT EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = v_resolved_doc_id
        AND d.user_id = auth.uid()
        AND auth.uid() IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'No autorizado para aceptar esta oferta' USING ERRCODE = '42501';
  END IF;
  
  -- A physician may only accept while actively on duty with live heartbeat.
  -- A stale app/notification must never claim a patient.
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_duty_status dds
    WHERE dds.doctor_id = v_resolved_doc_id
      AND dds.is_on_duty IS TRUE
      AND dds.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
      AND dds.current_active_request_id IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'doctor_not_available');
  END IF;

  -- Lock the patient request BEFORE accepting the offer, so cancelled or
  -- already matched patients cannot accidentally be reopened.
  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id = v_offer.dispatch_request_id FOR UPDATE;

  IF NOT FOUND OR v_req.status <> 'searching'
     OR v_req.care_country IS NULL OR v_req.care_country IS DISTINCT FROM
     (SELECT d.care_country FROM public.doctors d WHERE d.id=v_resolved_doc_id)
  THEN
    RETURN jsonb_build_object('success',false,'error','request_not_searching_or_country_mismatch');
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
  
  -- 3. Patient request was locked and checked before offer acceptance.

  IF v_req.care_country IS NULL OR v_req.care_country IS DISTINCT FROM
     app_private.assert_care_country_pair(v_req.patient_id,v_resolved_doc_id) THEN
    RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
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
$function$;

CREATE OR REPLACE FUNCTION public.get_my_pending_dispatch_offers()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $doctor_offers$
DECLARE v_user uuid := auth.uid(); v_doctor_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  SELECT d.id INTO v_doctor_id
  FROM public.doctors d
  JOIN public.doctor_duty_status dds ON dds.doctor_id=d.id
  WHERE d.user_id=v_user
    AND d.active IS TRUE
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND d.care_country IN ('AR','BR')
    AND NULLIF(btrim(d.license_number),'') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND dds.is_on_duty IS TRUE
    AND dds.last_heartbeat_at > NOW()-INTERVAL '90 seconds'
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'offer_id', o.id,
      'offer_expires_at', o.expires_at,
      'patient_dni', r.patient_dni,
      'patient_cpf', r.patient_cpf,
      'patient_phone', r.patient_phone,
      'patient_name', r.patient_name,
      'tier_requested', r.tier_requested,
      'symptom_summary', r.symptom_summary,
      'status', r.status,
      'assigned_doctor_id', r.assigned_doctor_id,
      'cloudflare_room_id', r.cloudflare_room_id,
      'care_country', r.care_country,
      'created_at', r.created_at
    ) ORDER BY r.created_at ASC)
     FROM public.dispatch_offers o
     JOIN public.pharmacy_dispatch_requests r ON r.id=o.dispatch_request_id
     JOIN public.doctors d ON d.id=v_doctor_id
     WHERE o.doctor_id=v_doctor_id
       AND o.status='pending'
       AND o.expires_at>NOW()
       AND r.status='searching'
       AND r.care_country=d.care_country),
    '[]'::jsonb
  );
END;
$doctor_offers$;

REVOKE ALL ON FUNCTION public.get_my_pending_dispatch_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pending_dispatch_offers() TO authenticated, service_role;

DROP POLICY IF EXISTS pharmacy_dispatch_requests_select_scoped ON public.pharmacy_dispatch_requests;
CREATE POLICY pharmacy_dispatch_requests_select_scoped
ON public.pharmacy_dispatch_requests
FOR SELECT TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    requested_by_user_id = (SELECT auth.uid())
    OR public.is_system_admin()
    OR EXISTS (
       SELECT 1 FROM public.doctors d
       WHERE d.id=pharmacy_dispatch_requests.assigned_doctor_id
         AND d.user_id=(SELECT auth.uid())
         AND d.active IS TRUE
         AND app_private.is_doctor_dispatch_approved(d.id)
         AND d.care_country=pharmacy_dispatch_requests.care_country
    )
    OR EXISTS (
       SELECT 1 FROM public.dispatch_offers o
       JOIN public.doctors d ON d.id=o.doctor_id
       WHERE o.dispatch_request_id=pharmacy_dispatch_requests.id
         AND o.status='pending'
         AND o.expires_at > NOW()
         AND d.user_id=(SELECT auth.uid())
         AND d.active IS TRUE
         AND app_private.is_doctor_dispatch_approved(d.id)
         AND d.care_country=pharmacy_dispatch_requests.care_country
    )
  )
);

COMMIT;
