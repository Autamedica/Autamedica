-- Static and ACL checks against disposable SQL replay.
BEGIN;
DO $test$
DECLARE
  v_trigger text;
  v_policy text;
BEGIN
  SELECT pg_get_functiondef(
    'public.assign_dispatch_patient_id()'::regprocedure
  ) INTO v_trigger;

  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_policy
  FROM pg_policy
  WHERE polrelid = 'public.pharmacy_dispatch_requests'::regclass
    AND polname = 'pharmacy_dispatch_requests_insert_kiosk_or_owner';

  IF v_policy IS NULL
    OR position('requested_by_user_id IS NULL' IN v_policy) = 0
    OR position('patient_dni' IN v_policy) = 0
    OR position('patient_cpf' IN v_policy) = 0
  THEN
    RAISE EXCEPTION 'Anonymous kiosk policy permits arbitrary user identity';
  END IF;

  IF v_trigger IS NULL
    OR position('dispatch_request_identity_denied' IN v_trigger) = 0
    OR position('auth.uid() IS DISTINCT FROM NEW.requested_by_user_id' IN v_trigger) = 0
    OR position('public.ensure_dispatch_patient' IN v_trigger) = 0
  THEN
    RAISE EXCEPTION 'Patient materialization must validate caller identity first';
  END IF;

  IF has_function_privilege('anon',
    'public.ensure_dispatch_patient(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous user can call materialization RPC directly';
  END IF;
END;
$test$;
ROLLBACK;
