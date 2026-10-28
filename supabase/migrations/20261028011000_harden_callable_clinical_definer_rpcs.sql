-- Guard callable SECURITY DEFINER helpers against arbitrary relationship and authorization probes.
-- Keep participant, administrator, service-role, policy, and internal scheduler behavior intact.

CREATE OR REPLACE FUNCTION public.is_platform_or_org_admin(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  identifier_column text;
  v_current_role text;
  v_is_service_role boolean := COALESCE((auth.jwt() ->> 'role') = 'service_role', false);
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;

  IF NOT v_is_service_role AND p_uid IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;

  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'user_id'
    ) THEN 'user_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'id'
    ) THEN 'id'
    ELSE NULL
  END
  INTO identifier_column;

  IF identifier_column IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT role::text FROM public.profiles WHERE %I = $1 LIMIT 1',
    identifier_column
  )
  INTO v_current_role
  USING p_uid;

  RETURN v_current_role IN ('platform_admin', 'organization_admin', 'admin');
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_active_authorization(
  p_record_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_service_role boolean := COALESCE((auth.jwt() ->> 'role') = 'service_role', false);
BEGIN
  IF NOT v_is_service_role
     AND (v_uid IS NULL
          OR (p_user_id IS DISTINCT FROM v_uid
              AND NOT public.is_platform_or_org_admin(v_uid))) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.medical_record_authorizations
    WHERE record_id = p_record_id
      AND authorized_user_id = p_user_id
      AND revoked_at IS NULL
      AND valid_until > pg_catalog.now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_in_care_team(p_doctor_id uuid, p_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_service_role boolean := COALESCE((auth.jwt() ->> 'role') = 'service_role', false);
  v_is_participant boolean;
BEGIN
  IF NOT v_is_service_role THEN
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = p_doctor_id
        AND d.user_id = v_uid
    ) OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = p_patient_id
        AND p.user_id = v_uid
    )
    INTO v_is_participant;

    IF NOT v_is_participant
       AND NOT public.is_platform_or_org_admin(v_uid) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.patient_care_team pct
    WHERE pct.doctor_id = p_doctor_id
      AND pct.patient_id = p_patient_id
      AND pct.active IS TRUE
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.doctor_can_chat_with_patient(
  target_doctor_id uuid,
  target_patient_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_service_role boolean := COALESCE((auth.jwt() ->> 'role') = 'service_role', false);
  v_is_participant boolean;
BEGIN
  IF NOT v_is_service_role THEN
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = target_doctor_id
        AND d.user_id = v_uid
    ) OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = target_patient_id
        AND p.user_id = v_uid
    )
    INTO v_is_participant;

    IF NOT v_is_participant
       AND NOT public.is_platform_or_org_admin(v_uid) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.patient_care_team pct
    WHERE pct.doctor_id = target_doctor_id
      AND pct.patient_id = target_patient_id
      AND pct.active IS TRUE
  ) OR EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.doctor_id = target_doctor_id
      AND a.patient_id = target_patient_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_doctor_online_minutes(
  p_doctor_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  heartbeat_count integer;
  v_uid uuid := auth.uid();
  v_is_service_role boolean := COALESCE((auth.jwt() ->> 'role') = 'service_role', false);
BEGIN
  IF NOT v_is_service_role
     AND NOT public.is_platform_or_org_admin(v_uid)
     AND NOT EXISTS (
       SELECT 1
       FROM public.doctors d
       WHERE d.id = p_doctor_id
         AND d.user_id = v_uid
     ) THEN
    RAISE EXCEPTION 'Not authorized to read this doctor activity'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer
  INTO heartbeat_count
  FROM public.doctor_heartbeats
  WHERE doctor_id = p_doctor_id
    AND created_at BETWEEN p_start_date AND p_end_date;

  RETURN heartbeat_count * 5;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.is_platform_or_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_or_org_admin(uuid) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_active_authorization(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_authorization(uuid, uuid) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_in_care_team(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_in_care_team(uuid, uuid) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.doctor_can_chat_with_patient(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_can_chat_with_patient(uuid, uuid) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_doctor_online_minutes(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_doctor_online_minutes(uuid, timestamptz, timestamptz) TO anon, authenticated, service_role;

-- This legacy scheduler is an owner/service operation and a safe no-op for the retired recordings table.
REVOKE ALL ON FUNCTION public.auto_delete_expired_recordings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_delete_expired_recordings() TO service_role;
