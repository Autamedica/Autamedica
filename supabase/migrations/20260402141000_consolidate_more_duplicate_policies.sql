-- Consolidate duplicated permissive policies on core identity/care-team tables.

BEGIN;

-- ============================================================================
-- profiles: keep the service-role policy scoped to the actual service_role
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage profiles" ON public.profiles;

CREATE POLICY "Service role can manage profiles"
  ON public.profiles
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (((select auth.jwt()) ->> 'role') = 'service_role')
  WITH CHECK (((select auth.jwt()) ->> 'role') = 'service_role');

-- ============================================================================
-- patients
-- ============================================================================

DROP POLICY IF EXISTS "Patients can view own profile" ON public.patients;
DROP POLICY IF EXISTS "patients_select_admin" ON public.patients;
DROP POLICY IF EXISTS "patients_select_company" ON public.patients;
DROP POLICY IF EXISTS "patients_select_doctor_care_team" ON public.patients;

CREATE POLICY "patients_select_scoped"
  ON public.patients
  FOR SELECT
  TO public
  USING (
    user_id = (select auth.uid())
    OR is_system_admin()
    OR (
      is_company_admin()
      AND organization_id IS NOT NULL
      AND user_belongs_to_company(organization_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.patient_care_team pct
      WHERE pct.patient_id = patients.id
        AND pct.doctor_id = get_my_doctor_id()
    )
  );

DROP POLICY IF EXISTS "patients_update_admin" ON public.patients;
DROP POLICY IF EXISTS "patients_update_doctor" ON public.patients;
DROP POLICY IF EXISTS "patients_update_self" ON public.patients;

CREATE POLICY "patients_update_scoped"
  ON public.patients
  FOR UPDATE
  TO public
  USING (
    is_system_admin()
    OR (is_doctor() AND doctor_has_patient_access(user_id))
    OR (user_id = (select auth.uid()) AND is_patient())
  )
  WITH CHECK (
    is_system_admin()
    OR (is_doctor() AND doctor_has_patient_access(user_id))
    OR (user_id = (select auth.uid()) AND is_patient())
  );

-- ============================================================================
-- doctor_patient
-- ============================================================================

DROP POLICY IF EXISTS "doctor_patient_delete_doctor" ON public.doctor_patient;
DROP POLICY IF EXISTS "doctor_patient_insert_doctor" ON public.doctor_patient;
DROP POLICY IF EXISTS "doctor_patient_manage_admin" ON public.doctor_patient;
DROP POLICY IF EXISTS "doctor_patient_select_doctor" ON public.doctor_patient;
DROP POLICY IF EXISTS "doctor_patient_select_patient" ON public.doctor_patient;

CREATE POLICY "doctor_patient_select_scoped"
  ON public.doctor_patient
  FOR SELECT
  TO public
  USING (
    is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = doctor_patient.doctor_id
        AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = doctor_patient.patient_id
        AND p.user_id = (select auth.uid())
    )
  );

CREATE POLICY "doctor_patient_insert_scoped"
  ON public.doctor_patient
  FOR INSERT
  TO public
  WITH CHECK (
    is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = doctor_patient.doctor_id
        AND d.user_id = (select auth.uid())
    )
  );

CREATE POLICY "doctor_patient_delete_scoped"
  ON public.doctor_patient
  FOR DELETE
  TO public
  USING (
    is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = doctor_patient.doctor_id
        AND d.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- patient_care_team
-- ============================================================================

DROP POLICY IF EXISTS "patient_care_team_all_admin" ON public.patient_care_team;
DROP POLICY IF EXISTS "patient_care_team_delete" ON public.patient_care_team;
DROP POLICY IF EXISTS "patient_care_team_insert" ON public.patient_care_team;
DROP POLICY IF EXISTS "patient_care_team_insert_doctor" ON public.patient_care_team;
DROP POLICY IF EXISTS "patient_care_team_select_admin" ON public.patient_care_team;
DROP POLICY IF EXISTS "pct_select_doctor" ON public.patient_care_team;
DROP POLICY IF EXISTS "pct_select_patient" ON public.patient_care_team;
DROP POLICY IF EXISTS "pct_update_doctor" ON public.patient_care_team;

CREATE POLICY "patient_care_team_select_scoped"
  ON public.patient_care_team
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = (select auth.uid())
        AND profiles.role = 'admin'
    )
    OR doctor_id = get_my_doctor_id()
    OR patient_id = get_my_patient_id()
  );

CREATE POLICY "patient_care_team_insert_scoped"
  ON public.patient_care_team
  FOR INSERT
  TO public
  WITH CHECK (
    is_system_admin()
    OR is_doctor()
    OR EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = patient_care_team.doctor_id
        AND d.user_id = (select auth.uid())
    )
  );

CREATE POLICY "patient_care_team_update_scoped"
  ON public.patient_care_team
  FOR UPDATE
  TO public
  USING (
    is_system_admin()
    OR doctor_id = get_my_doctor_id()
  )
  WITH CHECK (
    is_system_admin()
    OR doctor_id = get_my_doctor_id()
  );

CREATE POLICY "patient_care_team_delete_scoped"
  ON public.patient_care_team
  FOR DELETE
  TO public
  USING (is_system_admin());

COMMIT;
