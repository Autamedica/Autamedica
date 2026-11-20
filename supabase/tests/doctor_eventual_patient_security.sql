-- Contract test for the private identity boundary of doctor-created eventual patients.
-- Run after a complete local/staging migration replay inside a disposable database.
BEGIN;

DO $contracts$
DECLARE
  v_rls_enabled boolean;
  v_force_rls boolean;
  v_user_id_nullable text;
  v_function regprocedure;
BEGIN
  SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO v_rls_enabled, v_force_rls
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'patient_private_identities';

  IF v_rls_enabled IS DISTINCT FROM TRUE OR v_force_rls IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'patient_private_identities must enforce RLS for every non-bypass role';
  END IF;

  IF has_table_privilege('anon', 'public.patient_private_identities', 'SELECT')
     OR has_table_privilege('authenticated', 'public.patient_private_identities', 'SELECT')
     OR has_table_privilege('anon', 'public.patient_private_identities', 'INSERT')
     OR has_table_privilege('authenticated', 'public.patient_private_identities', 'INSERT') THEN
    RAISE EXCEPTION 'Private eventual-patient identity must not be directly accessible to clients';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.patient_private_identities', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.patient_private_identities', 'INSERT') THEN
    RAISE EXCEPTION 'Authorized backend role is missing private identity access';
  END IF;

  v_function := to_regprocedure(
    'public.create_doctor_eventual_patient(uuid,text,text,text,text,date,text,text,text,text)'
  );
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'create_doctor_eventual_patient RPC is missing';
  END IF;
  IF has_function_privilege('anon', v_function, 'EXECUTE')
     OR has_function_privilege('authenticated', v_function, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Eventual-patient RPC must be service-role only';
  END IF;

  SELECT is_nullable INTO v_user_id_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'user_id';
  IF v_user_id_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'patients.user_id must remain nullable for eventual patients';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patient_private_identities'
      AND column_name = 'consent_at' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patient_private_identities'
      AND column_name = 'consent_by' AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patient_private_identities'
      AND column_name = 'consent_scope' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Explicit consent timestamp, declaring doctor and scope must be persisted';
  END IF;
END;
$contracts$;

ROLLBACK;
