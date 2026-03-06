-- Fix infinite recursion: patients → patient_care_team → patients
--
-- The "Doctors can view assigned patients" policy on `patients` queries
-- `patient_care_team`, whose SELECT policies query `patients` back → recursion.
--
-- Fix: Replace patient_care_team SELECT policies to use SECURITY DEFINER
-- helpers (get_my_patient_id / get_my_doctor_id) instead of direct JOINs
-- to patients/doctors tables.

BEGIN;

-- ============================================================
-- Step 1: Drop all patient_care_team SELECT policies that reference patients/doctors
-- ============================================================

DROP POLICY IF EXISTS "patient_care_team_select" ON public.patient_care_team;
DROP POLICY IF EXISTS "patient_care_team_select_patient" ON public.patient_care_team;
DROP POLICY IF EXISTS "patient_care_team_select_doctor" ON public.patient_care_team;

-- ============================================================
-- Step 2: Recreate patient_care_team SELECT policies using SECURITY DEFINER helpers
-- ============================================================

-- Patients can see their own care team entries
CREATE POLICY "pct_select_patient" ON public.patient_care_team
  FOR SELECT
  USING (patient_id = public.get_my_patient_id());

-- Doctors can see care team entries they belong to
CREATE POLICY "pct_select_doctor" ON public.patient_care_team
  FOR SELECT
  USING (doctor_id = public.get_my_doctor_id());

-- ============================================================
-- Step 3: Fix patient_care_team UPDATE policy (also references doctors)
-- ============================================================

DROP POLICY IF EXISTS "patient_care_team_update" ON public.patient_care_team;

CREATE POLICY "pct_update_doctor" ON public.patient_care_team
  FOR UPDATE
  USING (
    doctor_id = public.get_my_doctor_id()
    OR public.is_system_admin()
  );

-- ============================================================
-- Step 4: Fix "Doctors can view assigned patients" on patients table
-- Replace JOIN through doctors with get_my_doctor_id() to avoid
-- triggering doctors table RLS unnecessarily
-- ============================================================

DROP POLICY IF EXISTS "Doctors can view assigned patients" ON public.patients;

CREATE POLICY "patients_select_doctor_care_team" ON public.patients
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patient_care_team pct
      WHERE pct.patient_id = patients.id
        AND pct.doctor_id = public.get_my_doctor_id()
    )
  );

COMMIT;
