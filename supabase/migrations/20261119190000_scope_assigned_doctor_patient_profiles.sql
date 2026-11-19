-- Restrict doctor access to patient identity to existing, authorized clinical links.
-- The prior role='doctor' JWT predicate was ineffective for normal Supabase
-- authenticated sessions and, if populated, would have been broader than necessary.
BEGIN;

DROP POLICY IF EXISTS "Doctors global patient search" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_assigned_patient" ON public.profiles;

CREATE POLICY "profiles_select_assigned_patient"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.doctor_has_patient_read_access(user_id));

-- The Android patient list is sourced from doctor_patient. Make the matching
-- patient row readable through the exact same approved/legacy relationship,
-- without granting access to unrelated patient records.
DROP POLICY IF EXISTS "patients_select_doctor_patient_link" ON public.patients;
CREATE POLICY "patients_select_doctor_patient_link"
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    active IS TRUE
    AND public.is_clinically_authorized_doctor_read_for_patient(id)
    AND EXISTS (
      SELECT 1
      FROM public.doctors d
      JOIN public.doctor_patient dp
        ON dp.doctor_id = d.id
       AND dp.patient_id = patients.id
      WHERE d.user_id = (SELECT auth.uid())
        AND d.active IS TRUE
    )
  );

COMMIT;
