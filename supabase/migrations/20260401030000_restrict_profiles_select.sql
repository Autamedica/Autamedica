-- Migration: Restrict overly permissive profiles SELECT access
-- Date: 2026-04-01
--
-- The live schema uses profiles.user_id as PK. Older versions of this
-- migration referenced profiles.id and company-specific columns that are
-- no longer present. Keep the migration focused on the actual regression:
-- removing profiles_select_all while preserving the self/admin policies that
-- already exist in production.

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY "profiles_select_own" ON public.profiles
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END
$$;
