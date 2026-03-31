-- ============================================================
-- Migration: Harden SELECT RLS policies for soft-deleted records
-- Date: 2026-03-31
-- Purpose: Add deleted_at IS NULL to all SELECT policies on
--          clinical tables that use soft-delete, preventing
--          soft-deleted rows from leaking through RLS.
-- Tables: medical_records, vital_signs, medication_logs,
--          symptom_reports, lab_results
-- Note: anamnesis already filters by deleted_at IS NULL.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. medical_records
-- ============================================================

-- 1a. "Doctors can view care team records"
DROP POLICY IF EXISTS "Doctors can view care team records" ON public.medical_records;
CREATE POLICY "Doctors can view care team records" ON public.medical_records
FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = medical_records.doctor_id
        AND d.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.patient_care_team pct
      JOIN public.doctors d ON d.id = pct.doctor_id
      WHERE pct.patient_id = medical_records.patient_id
        AND d.user_id = auth.uid()
    )
  )
);

-- 1b. "Patients can view their visible records"
DROP POLICY IF EXISTS "Patients can view their visible records" ON public.medical_records;
CREATE POLICY "Patients can view their visible records" ON public.medical_records
FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = medical_records.patient_id
      AND p.user_id = auth.uid()
  )
  AND visibility = ANY (ARRAY['patient'::text, 'care_team'::text])
);

-- 1c. "medical_records_select_restricted"
DROP POLICY IF EXISTS "medical_records_select_restricted" ON public.medical_records;
CREATE POLICY "medical_records_select_restricted" ON public.medical_records
FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = medical_records.patient_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = medical_records.patient_id
        AND public.doctor_has_patient_access(p.user_id)
    )
    OR public.is_system_admin()
  )
);

-- ============================================================
-- 2. vital_signs
-- ============================================================

-- 2a. "doctors_read_assigned_vitals"
DROP POLICY IF EXISTS "doctors_read_assigned_vitals" ON public.vital_signs;
CREATE POLICY "doctors_read_assigned_vitals" ON public.vital_signs
FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.doctor_patient dp
    JOIN public.doctors d ON d.id = dp.doctor_id
    WHERE d.user_id = auth.uid()
      AND dp.patient_id = vital_signs.patient_id
  )
);

-- 2b. "patients_read_own_vitals"
DROP POLICY IF EXISTS "patients_read_own_vitals" ON public.vital_signs;
CREATE POLICY "patients_read_own_vitals" ON public.vital_signs
FOR SELECT
USING (
  deleted_at IS NULL
  AND patient_id IN (
    SELECT patients.id FROM public.patients
    WHERE patients.user_id = auth.uid()
  )
);

-- ============================================================
-- 3. medication_logs
-- ============================================================

-- 3a. "doctors_read_assigned_medication_logs"
DROP POLICY IF EXISTS "doctors_read_assigned_medication_logs" ON public.medication_logs;
CREATE POLICY "doctors_read_assigned_medication_logs" ON public.medication_logs
FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.doctor_patient dp
    JOIN public.doctors d ON d.id = dp.doctor_id
    WHERE d.user_id = auth.uid()
      AND dp.patient_id = medication_logs.patient_id
  )
);

-- 3b. "patients_read_own_medication_logs"
DROP POLICY IF EXISTS "patients_read_own_medication_logs" ON public.medication_logs;
CREATE POLICY "patients_read_own_medication_logs" ON public.medication_logs
FOR SELECT
USING (
  deleted_at IS NULL
  AND patient_id IN (
    SELECT patients.id FROM public.patients
    WHERE patients.user_id = auth.uid()
  )
);

-- ============================================================
-- 4. symptom_reports
-- ============================================================

-- 4a. "doctors_read_assigned_symptoms"
DROP POLICY IF EXISTS "doctors_read_assigned_symptoms" ON public.symptom_reports;
CREATE POLICY "doctors_read_assigned_symptoms" ON public.symptom_reports
FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.doctor_patient dp
    JOIN public.doctors d ON d.id = dp.doctor_id
    WHERE d.user_id = auth.uid()
      AND dp.patient_id = symptom_reports.patient_id
  )
);

-- 4b. "patients_read_own_symptoms"
DROP POLICY IF EXISTS "patients_read_own_symptoms" ON public.symptom_reports;
CREATE POLICY "patients_read_own_symptoms" ON public.symptom_reports
FOR SELECT
USING (
  deleted_at IS NULL
  AND patient_id IN (
    SELECT patients.id FROM public.patients
    WHERE patients.user_id = auth.uid()
  )
);

-- ============================================================
-- 5. lab_results
-- ============================================================

-- 5a. "doctors_read_assigned_lab_results"
DROP POLICY IF EXISTS "doctors_read_assigned_lab_results" ON public.lab_results;
CREATE POLICY "doctors_read_assigned_lab_results" ON public.lab_results
FOR SELECT
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.doctor_patient dp
    JOIN public.doctors d ON d.id = dp.doctor_id
    WHERE d.user_id = auth.uid()
      AND dp.patient_id = lab_results.patient_id
  )
);

-- 5b. "patients_read_own_lab_results"
DROP POLICY IF EXISTS "patients_read_own_lab_results" ON public.lab_results;
CREATE POLICY "patients_read_own_lab_results" ON public.lab_results
FOR SELECT
USING (
  deleted_at IS NULL
  AND patient_id IN (
    SELECT patients.id FROM public.patients
    WHERE patients.user_id = auth.uid()
  )
);

COMMIT;
