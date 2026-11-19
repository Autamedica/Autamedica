-- Report heartbeat success only when the canonical active-duty row was updated.
-- Caller identity and clinical approval checks remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.doctor_heartbeat(p_doctor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_doctor_id UUID;
    v_now TIMESTAMPTZ := NOW();
    v_updated_rows INTEGER := 0;
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
    IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_doctor_id) IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'No autorizado para emitir heartbeat de este médico' USING ERRCODE = '42501';
    END IF;

    IF NOT app_private.is_doctor_dispatch_approved(v_doctor_id) THEN
        RAISE EXCEPTION 'DOCTOR_PENDING_CLINICAL_APPROVAL' USING ERRCODE = '42501';
    END IF;

    -- 1.2 Actualiza doctor_duty_status si está en guardia
    UPDATE public.doctor_duty_status
    SET last_heartbeat_at = v_now,
        updated_at = v_now
    WHERE doctor_id = v_doctor_id
      AND is_on_duty = true;
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

    IF v_updated_rows = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DOCTOR_NOT_ON_DUTY',
            'timestamp', v_now,
            'updated_rows', v_updated_rows
        );
    END IF;

    -- Only refresh active sessions after the canonical duty row was updated.
    UPDATE public.doctor_on_duty_sessions
    SET last_heartbeat_at = v_now
    WHERE doctor_id = v_doctor_id
      AND status = 'active';

    RETURN jsonb_build_object(
        'success', true,
        'timestamp', v_now,
        'updated_rows', v_updated_rows
    );
END;
$function$;
COMMIT;
