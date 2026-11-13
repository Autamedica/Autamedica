-- Read-only privilege regression check. Expected to run after both
-- 20261031054700 and 20261031054939 migrations.
DO $check$
DECLARE v_oid oid := to_regprocedure('public.community_group_allowed_for_patient(uuid,uuid)');
BEGIN
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Eligibility helper is missing'; END IF;
  IF has_function_privilege('anon',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous RPC execution unexpectedly allowed';
  END IF;
  IF NOT has_function_privilege('authenticated',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated community policy dependency denied';
  END IF;
  IF NOT has_function_privilege('service_role',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'Service role unexpectedly denied';
  END IF;
  IF strpos(pg_get_functiondef(v_oid), 'patients.user_id = auth.uid()')=0 THEN
    RAISE EXCEPTION 'Patient ownership guard absent';
  END IF;
END;
$check$;
