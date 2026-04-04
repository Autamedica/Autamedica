-- Revert: restore profiles_select_self_or_admin to original version
-- The previous migration (20260404010000) added doctor_can_read_profile()
-- which depends on patient_care_team and breaks profile reads for doctors
-- without care_team entries.

BEGIN;

DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_self_or_admin"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    user_id = (select auth.uid())
    OR public.is_platform_or_org_admin((select auth.uid()))
  );

DROP FUNCTION IF EXISTS public.doctor_can_read_profile(uuid);

COMMIT;
