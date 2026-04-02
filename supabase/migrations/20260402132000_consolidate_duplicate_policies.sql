-- Consolidate obviously duplicated permissive policies without widening access.

BEGIN;

-- ============================================================================
-- calls
-- ============================================================================

DROP POLICY IF EXISTS "doctors_own_calls" ON public.calls;
DROP POLICY IF EXISTS "patients_own_calls" ON public.calls;

CREATE POLICY "calls_participants_all"
  ON public.calls
  FOR ALL
  TO public
  USING (
    (doctor_id = (select auth.uid()))
    OR (patient_id = (select auth.uid()))
    OR (doctor_id IN (
      SELECT d.id
      FROM public.doctors d
      WHERE d.user_id = (select auth.uid())
    ))
    OR (patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = (select auth.uid())
    ))
  )
  WITH CHECK (
    (doctor_id = (select auth.uid()))
    OR (patient_id = (select auth.uid()))
    OR (doctor_id IN (
      SELECT d.id
      FROM public.doctors d
      WHERE d.user_id = (select auth.uid())
    ))
    OR (patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = (select auth.uid())
    ))
  );

-- ============================================================================
-- profiles
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_view_admin" ON public.profiles;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;

CREATE POLICY "profiles_select_self_or_admin"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    user_id = (select auth.uid())
    OR public.is_platform_or_org_admin((select auth.uid()))
  );

CREATE POLICY "profiles_update_self"
  ON public.profiles
  FOR UPDATE
  TO public
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "profiles_insert_self"
  ON public.profiles
  FOR INSERT
  TO public
  WITH CHECK (user_id = (select auth.uid()));

-- Keep profiles_delete_admin and service-role policy as-is.

-- ============================================================================
-- telemedicine_sessions
-- ============================================================================

DROP POLICY IF EXISTS "Doctors can view own sessions" ON public.telemedicine_sessions;
DROP POLICY IF EXISTS "Patients can view own sessions" ON public.telemedicine_sessions;
DROP POLICY IF EXISTS "doctors_view_own_sessions" ON public.telemedicine_sessions;
DROP POLICY IF EXISTS "patients_view_own_sessions" ON public.telemedicine_sessions;

DROP POLICY IF EXISTS "Patients can create sessions" ON public.telemedicine_sessions;
DROP POLICY IF EXISTS "doctors_create_sessions" ON public.telemedicine_sessions;

DROP POLICY IF EXISTS "Participants can update sessions" ON public.telemedicine_sessions;
DROP POLICY IF EXISTS "doctors_update_own_sessions" ON public.telemedicine_sessions;
DROP POLICY IF EXISTS "patients_update_own_sessions" ON public.telemedicine_sessions;

CREATE POLICY "telemedicine_sessions_select_participants"
  ON public.telemedicine_sessions
  FOR SELECT
  TO public
  USING (
    doctor_id = (select auth.uid())
    OR patient_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = telemedicine_sessions.doctor_id
        AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = telemedicine_sessions.patient_id
        AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "telemedicine_sessions_insert_participants"
  ON public.telemedicine_sessions
  FOR INSERT
  TO public
  WITH CHECK (
    patient_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = telemedicine_sessions.doctor_id
        AND d.user_id = (select auth.uid())
    )
  );

CREATE POLICY "telemedicine_sessions_update_participants"
  ON public.telemedicine_sessions
  FOR UPDATE
  TO public
  USING (
    patient_id = (select auth.uid())
    OR doctor_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = telemedicine_sessions.doctor_id
        AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = telemedicine_sessions.patient_id
        AND p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    patient_id = (select auth.uid())
    OR doctor_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = telemedicine_sessions.doctor_id
        AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = telemedicine_sessions.patient_id
        AND p.user_id = (select auth.uid())
    )
  );

COMMIT;
