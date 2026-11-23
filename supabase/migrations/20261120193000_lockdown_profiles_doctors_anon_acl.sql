-- Remove direct anonymous access to identity-bearing profile and doctor tables.
-- Authenticated application access and service_role access remain unchanged.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon;
REVOKE ALL PRIVILEGES ON TABLE public.doctors FROM PUBLIC, anon;

-- Public directory reads must use authenticated, scoped policies rather than anon.
DROP POLICY IF EXISTS "anon_active_doctor_directory" ON public.doctors;
DROP POLICY IF EXISTS "country_doctor_directory_anon" ON public.doctors;
DROP POLICY IF EXISTS "country_doctor_profiles_anon" ON public.profiles;
ALTER POLICY "Allow read doctor profiles" ON public.profiles TO authenticated;

COMMIT;
