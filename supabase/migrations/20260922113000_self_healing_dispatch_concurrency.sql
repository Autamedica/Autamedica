-- Migration: 20260922113000_self_healing_dispatch_concurrency.sql
-- Description: Implementa auto-recuperación (self-healing) de concurrencia en despacho médico on-demand.
-- Elimina bloqueos zombie (DOCTOR_ALREADY_IN_CALL) cuando una consulta anterior se desconectó,
-- fue cancelada, expiró o quedó huérfana sin iniciar video.

-- 1. RPC Atómica Endurecida con Auto-Recuperación: public.claim_pharmacy_request_tier
CREATE OR REPLACE FUNCTION public.claim_pharmacy_request_tier(
    p_request_id UUID,
    p_doctor_id UUID
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
BEGIN
    -- Resolver ID canónico del doctor (por id o por user_id)
    SELECT id INTO v_resolved_doc_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_resolved_doc_id IS NULL THEN
        v_resolved_doc_id := p_doctor_id;
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

    -- 5. Adjudicación atómica al médico
    UPDATE public.pharmacy_dispatch_requests
    SET assigned_doctor_id = v_resolved_doc_id,
        status = 'matched',
        matched_at = NOW()
    WHERE id = p_request_id;

    -- 6. Marcar al médico ocupado en guardia
    UPDATE public.doctor_duty_status
    SET current_active_request_id = p_request_id,
        updated_at = NOW()
    WHERE doctor_id = v_duty.doctor_id;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'MATCH_SUCCESSFUL',
        'request_id', v_req.id,
        'cloudflare_room_id', v_req.cloudflare_room_id,
        'patient_dni', v_req.patient_dni,
        'patient_phone', v_req.patient_phone,
        'tier_requested', v_req.tier_requested
    );
END;
$$;

-- 2. Nueva RPC Canónica: public.finish_pharmacy_consultation
-- Permite finalizar una consulta y liberar la guardia del médico de forma atómica y segura
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
    SELECT id INTO v_resolved_doc_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_resolved_doc_id IS NULL THEN
        v_resolved_doc_id := p_doctor_id;
    END IF;

    -- Si no se proporcionó p_request_id, obtener el request activo del médico
    IF v_target_request_id IS NULL THEN
        SELECT current_active_request_id INTO v_target_request_id
        FROM public.doctor_duty_status
        WHERE doctor_id = v_resolved_doc_id;
    END IF;

    -- Cerrar la solicitud de despacho
    IF v_target_request_id IS NOT NULL THEN
        UPDATE public.pharmacy_dispatch_requests
        SET status = 'completed',
            call_ended_at = COALESCE(call_ended_at, NOW())
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

-- 3. Actualizar public.set_doctor_duty_status para limpiar lock al apagar guardia
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
BEGIN
    SELECT id INTO v_resolved_doc_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_resolved_doc_id IS NULL THEN
        v_resolved_doc_id := p_doctor_id;
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

-- 4. Actualizar public.get_active_on_duty_doctors con validación viva de disponibilidad
CREATE OR REPLACE FUNCTION public.get_active_on_duty_doctors()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'name', CASE 
                WHEN TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) <> '' 
                THEN 'Dr. ' || TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))
                ELSE 'Dr. Médico de Guardia'
            END,
            'short_name', CASE
                WHEN COALESCE(p.last_name, '') <> '' THEN 'Dr. ' || p.last_name
                WHEN COALESCE(p.first_name, '') <> '' THEN 'Dr. ' || p.first_name
                ELSE 'Dr. de Guardia'
            END,
            'specialty', COALESCE(d.specialty, 'Medicina General'),
            'initials', UPPER(
                COALESCE(NULLIF(SUBSTRING(p.first_name, 1, 1), ''), 'M') || 
                COALESCE(NULLIF(SUBSTRING(p.last_name, 1, 1), ''), 'G')
            ),
            'status_text', CASE 
                WHEN dds.current_active_request_id IS NULL 
                     OR pdr.id IS NULL 
                     OR pdr.status IN ('completed', 'cancelled', 'expired') 
                     OR (pdr.status = 'matched' AND pdr.call_started_at IS NULL AND pdr.matched_at < NOW() - INTERVAL '60 seconds')
                THEN 'En línea'
                ELSE 'En consulta' 
            END,
            'is_available', (
                dds.current_active_request_id IS NULL 
                OR pdr.id IS NULL 
                OR pdr.status IN ('completed', 'cancelled', 'expired')
                OR (pdr.status = 'matched' AND pdr.call_started_at IS NULL AND pdr.matched_at < NOW() - INTERVAL '60 seconds')
            ),
            'registration', TRIM(COALESCE(d.license_type, 'MN') || ' ' || COALESCE(d.license_number, ''))
        )
    ) INTO v_result
    FROM public.doctor_duty_status dds
    JOIN public.doctors d ON d.id = dds.doctor_id
    LEFT JOIN public.profiles p ON p.user_id = d.user_id
    LEFT JOIN public.pharmacy_dispatch_requests pdr ON pdr.id = dds.current_active_request_id
    WHERE dds.is_on_duty = true;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 5. Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.claim_pharmacy_request_tier(UUID, UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.finish_pharmacy_consultation(UUID, UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.set_doctor_duty_status(UUID, BOOLEAN, public.dispatch_tier_category[]) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.get_active_on_duty_doctors() TO authenticated, service_role, anon;
