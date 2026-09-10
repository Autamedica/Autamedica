-- Allow authenticated and anon users (e.g. patients and directory visitors) to read active doctor profiles
DROP POLICY IF EXISTS "profiles_select_doctors_public" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated read doctor profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow read doctor profiles" ON public.profiles;

CREATE POLICY "Allow read doctor profiles"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.doctors
      WHERE doctors.user_id = profiles.user_id
      AND doctors.active = true
    )
  );
