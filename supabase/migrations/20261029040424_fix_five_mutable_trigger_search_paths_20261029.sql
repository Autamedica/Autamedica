-- Harden low-risk trigger functions with deterministic built-in search path.
-- Some production-only functions do not exist when replaying this schema
-- in an isolated database: guard each ALTER without weakening production.
DO $$
BEGIN
  IF to_regprocedure('public.api_keys_set_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.api_keys_set_updated_at() SET search_path = pg_catalog;
  END IF;
  IF to_regprocedure('public.handle_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.handle_updated_at() SET search_path = pg_catalog;
  END IF;
  IF to_regprocedure('public.set_clinical_case_state_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.set_clinical_case_state_updated_at() SET search_path = pg_catalog;
  END IF;
  IF to_regprocedure('public.touch_patient_wallets_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.touch_patient_wallets_updated_at() SET search_path = pg_catalog;
  END IF;
  IF to_regprocedure('public.update_doctor_heartbeat()') IS NOT NULL THEN
    ALTER FUNCTION public.update_doctor_heartbeat() SET search_path = pg_catalog;
  END IF;
END
$$;
