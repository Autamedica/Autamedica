-- Block unapproved clinicians at the actual database authorization boundary.
-- An existing pre-approval Android build must NOT be able to bypass these checks.
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
$function$;

CREATE OR REPLACE FUNCTION public.get_active_on_duty_doctors()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    WHERE dds.is_on_duty = true
      AND d.active IS TRUE AND d.care_country=app_private.viewer_care_country()
      AND app_private.is_doctor_dispatch_approved(d.id)
      AND dds.last_heartbeat_at > (NOW() - INTERVAL '90 seconds');

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_doctor_duty_status(p_doctor_id uuid, p_is_on_duty boolean, p_active_tiers dispatch_tier_category[] DEFAULT '{general}'::dispatch_tier_category[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    IF auth.role() IS DISTINCT FROM 'service_role' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_resolved_doc_id) IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'No autorizado para modificar guardia de este médico' USING ERRCODE = '42501';
    END IF;

    -- A technical doctor row is not admin approval. Only an approved
    -- practitioner may activate guard; turning guard OFF always remains allowed.
    IF p_is_on_duty IS TRUE AND NOT app_private.is_doctor_dispatch_approved(v_resolved_doc_id) THEN
        RAISE EXCEPTION 'DOCTOR_PENDING_CLINICAL_APPROVAL' USING ERRCODE = '42501';
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
$function$;

-- Authenticated doctor can check eligibility without viewing another doctor.
CREATE OR REPLACE FUNCTION public.get_my_guard_approval()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $get_approval$
DECLARE
  v_user uuid := auth.uid();
  v_doctor public.doctors%ROWTYPE;
  v_status text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_doctor FROM public.doctors
  WHERE user_id=v_user
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('approved',false,'code','DOCTOR_PROFILE_MISSING');
  END IF;
  IF v_doctor.care_country='AR' THEN
    SELECT sss_validation_status INTO v_status FROM public.profiles
    WHERE user_id=v_user;
  ELSE
    SELECT coalesce(max(l.cfm_validation_status),'pending')
    INTO v_status FROM public.doctor_licenses l
    WHERE l.doctor_id=v_doctor.id AND l.license_type='CRM' AND l.status='active';
  END IF;
  RETURN jsonb_build_object(
    'approved',app_private.is_doctor_dispatch_approved(v_doctor.id),
    'doctor_id',v_doctor.id,
    'care_country',v_doctor.care_country,
    'verification_status',coalesce(v_status,'pending'),
    'code', CASE WHEN app_private.is_doctor_dispatch_approved(v_doctor.id)
      THEN 'CLINICALLY_APPROVED' ELSE 'DOCTOR_PENDING_CLINICAL_APPROVAL' END
  );
END;
$get_approval$;

REVOKE ALL ON FUNCTION public.get_my_guard_approval() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_guard_approval() TO authenticated, service_role;

-- Privileged web gateways bypass RLS. They must consult the same single
-- approval predicate as Android/Postgres rather than use doctors.active.
CREATE OR REPLACE FUNCTION public.admin_is_dispatch_doctor_approved(p_doctor_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $admin_approval$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  RETURN app_private.is_doctor_dispatch_approved(p_doctor_id);
END;
$admin_approval$;

REVOKE ALL ON FUNCTION public.admin_is_dispatch_doctor_approved(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_is_dispatch_doctor_approved(uuid)
  TO service_role;

-- Disable stale waiting duty for unapproved accounts, without cancelling or
-- altering an already-assigned consultation.
UPDATE public.doctor_duty_status duty
SET is_on_duty = false,
    updated_at = NOW()
WHERE duty.is_on_duty IS TRUE
  AND duty.current_active_request_id IS NULL
  AND NOT app_private.is_doctor_dispatch_approved(duty.doctor_id);

COMMIT;
