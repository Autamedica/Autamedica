-- Run on a disposable Supabase database after migrations are replayed.
-- No data mutations, no notifications and no real patient identifiers.
DO $audit$
DECLARE
  v_fn oid := 'public.create_call(uuid,uuid,uuid)'::regprocedure::oid;
  v_definition text;
BEGIN
  IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'create_call: anon must not have EXECUTE';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'create_call: expected clinical and backend callers cannot EXECUTE';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(v_fn) INTO v_definition;

  IF v_definition NOT LIKE '%v_auth_user%'
     OR v_definition NOT LIKE '%a.doctor_id = p_doctor_id%'
     OR v_definition NOT LIKE '%a.patient_id = p_patient_id%'
     OR v_definition NOT LIKE '%pct.doctor_id = p_doctor_id%'
     OR v_definition NOT LIKE '%v_is_service_role%' THEN
    RAISE EXCEPTION 'create_call: mandatory participant authorization is missing';
  END IF;

  -- Reject invalid IDs before any INSERT, including for a privileged caller.
  BEGIN
    PERFORM * FROM public.create_call(NULL::uuid, NULL::uuid, NULL::uuid);
    RAISE EXCEPTION 'create_call: null doctor/patient was accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      RAISE NOTICE 'create_call: invalid participants rejected';
  END;

  RAISE NOTICE 'create_call: permission and authorization smoke checks passed';
END;
$audit$;
