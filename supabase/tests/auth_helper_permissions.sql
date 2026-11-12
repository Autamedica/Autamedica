-- Read-only regression against existing application data; temporary state always rolls back.
BEGIN ISOLATION LEVEL REPEATABLE READ;
CREATE TEMP TABLE helper_probe_expected AS
SELECT (SELECT count(*) FROM public.doctors WHERE active=true) doctors,
       (SELECT count(*) FROM public.companies WHERE active=true) companies,
       (SELECT count(*) FROM public.profiles p WHERE EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id=p.user_id AND d.active=true)) doctor_profiles;
GRANT SELECT ON helper_probe_expected TO anon, authenticated;

DO $contracts$
DECLARE signature text; target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.can_access_p2p_chat_session(uuid)','public.current_doctor_profile_id()','public.current_patient_can_access_community_group(uuid)','public.current_patient_owns_community_post(uuid)','public.current_pharmacist_id()','public.current_pharmacist_pharmacy_ids()','public.doctor_can_chat_with_patient(uuid,uuid)','public.doctor_has_patient_access(uuid)','public.get_assigned_chat_doctor(uuid)','public.get_my_doctor_id()','public.get_my_patient_id()','public.get_user_role(uuid)','public.has_active_authorization(uuid,uuid)','public.is_company_admin()','public.is_doctor()','public.is_in_care_team(uuid,uuid)','public.is_patient()','public.is_platform_or_org_admin(uuid)','public.is_system_admin()','public.user_belongs_to_company(uuid)','public.search_medications_br(text,integer)'] LOOP
    target:=to_regprocedure(signature);
    IF target IS NULL OR has_function_privilege('anon',target,'EXECUTE')
      OR NOT has_function_privilege('authenticated',target,'EXECUTE')
      OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN
      RAISE EXCEPTION 'Authentication helper ACL violation: %',signature;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_depend d JOIN pg_policy p ON p.oid=d.objid
      WHERE d.refclassid='pg_proc'::regclass AND d.refobjid=target
        AND d.classid='pg_policy'::regclass
        AND (0=ANY(p.polroles) OR 'anon'::regrole::oid=ANY(p.polroles))
    ) THEN RAISE EXCEPTION 'Anonymous policy still depends on %',signature; END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY['public.get_active_on_duty_doctors()','public.get_content_mode()','public.get_doctor_busy_slots(uuid,date,date)','public.get_duty_doctors_summary()','public.get_pharmacy_tiers_status()'] LOOP
    target:=to_regprocedure(signature);
    -- get_content_mode remains a public helper. The four guard RPCs have
    -- anonymous execution revoked by the hardening migration; authenticated
    -- and service-role access remain available. Two optional legacy helpers
    -- may be absent when a deployment never installed their definitions.
    IF target IS NULL THEN
      IF signature IN ('public.get_content_mode()', 'public.get_pharmacy_tiers_status()') THEN
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'Guard RPC unavailable: %',signature;
    END IF;
    IF signature='public.get_content_mode()' THEN
      IF NOT has_function_privilege('anon',target,'EXECUTE')
        OR NOT has_function_privilege('authenticated',target,'EXECUTE')
        OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN
        RAISE EXCEPTION 'Public content mode ACL violation: %',signature;
      END IF;
    ELSE
      IF has_function_privilege('anon',target,'EXECUTE')
        OR NOT has_function_privilege('authenticated',target,'EXECUTE')
        OR NOT has_function_privilege('service_role',target,'EXECUTE') THEN
        RAISE EXCEPTION 'Anonymous guard RPC ACL violation: %',signature;
      END IF;
    END IF;
  END LOOP;
END;
$contracts$;

SELECT set_config('request.jwt.claims','{"role":"anon"}',true),
       set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claim.role','anon',true);
SET LOCAL ROLE anon;
DO $anonymous$
DECLARE relation_name text; n bigint;
BEGIN
  BEGIN
    PERFORM public.is_doctor();
    RAISE EXCEPTION 'Anonymous caller executed a private helper';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.search_medications_br('',1);
    RAISE EXCEPTION 'Anonymous caller executed authenticated medication search';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM public.doctors) <> (SELECT doctors FROM pg_temp.helper_probe_expected)
    OR EXISTS (SELECT 1 FROM public.doctors WHERE active IS DISTINCT FROM true)
    OR (SELECT count(*) FROM public.companies) <> (SELECT companies FROM pg_temp.helper_probe_expected)
    OR EXISTS (SELECT 1 FROM public.companies WHERE active IS DISTINCT FROM true)
    OR (SELECT count(*) FROM public.profiles) <> (SELECT doctor_profiles FROM pg_temp.helper_probe_expected)
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id=p.user_id AND d.active=true)) THEN
    RAISE EXCEPTION 'Anonymous active directory visibility changed';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['appointments','audit_logs','conversation_events','conversation_sessions','doctor_patient','medical_records','patient_care_team','patients'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',relation_name) INTO n;
    IF n<>0 THEN RAISE EXCEPTION 'Protected relation visible anonymously: %',relation_name; END IF;
  END LOOP;
END;
$anonymous$;
RESET ROLE;

-- A nonexistent subject exercises authenticated policy evaluation without creating users.
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000"}',true),
       set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true),
       set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $authenticated$
DECLARE relation_name text; n bigint;
BEGIN
  PERFORM 1 FROM public.search_medications_br('',1);
  IF public.is_doctor() OR public.is_patient() OR public.is_system_admin()
    OR public.get_my_doctor_id() IS NOT NULL OR public.get_my_patient_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Nonexistent subject acquired a protected identity';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['appointments','audit_logs','companies','conversation_events','conversation_sessions','doctor_patient','doctors','medical_records','patient_care_team','patients','profiles'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',relation_name) INTO n;
  END LOOP;
END;
$authenticated$;
RESET ROLE;
SELECT 'PASS: private helper ACLs, public policy isolation, anonymous directories and authenticated queries' AS result;
ROLLBACK;
