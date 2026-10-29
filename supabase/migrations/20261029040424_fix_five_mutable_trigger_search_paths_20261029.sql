-- Harden low-risk trigger functions with deterministic built-in search path.
-- Mirrored from already applied AutaMedica production migration on 2026-10-29.
ALTER FUNCTION public.api_keys_set_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.handle_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.set_clinical_case_state_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.touch_patient_wallets_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.update_doctor_heartbeat() SET search_path = pg_catalog;
