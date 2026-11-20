-- Restrict anonymous access to profiles.
-- public.profiles contains private contact, identity and device-token columns.
-- Patient doctor-directory access remains available to authenticated users via
-- the existing authenticated RLS policies.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;

-- This legacy permissive policy exposed every column of active doctor profiles
-- to anon. Authenticated doctor-directory policies remain in place.
DROP POLICY IF EXISTS "Allow read doctor profiles" ON public.profiles;
DROP POLICY IF EXISTS country_doctor_profiles_anon ON public.profiles;

COMMIT;
