-- Fix policies accidentally created FOR PUBLIC instead of service_role.
-- Patients retain SELECT of their own rows; service_role retains full access.
ALTER TABLE public.clinical_patient_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_symptom_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can read own clinical conditions" ON public.clinical_patient_conditions;
DROP POLICY IF EXISTS "Service role manages clinical conditions" ON public.clinical_patient_conditions;
CREATE POLICY "Patients can read own clinical conditions"
  ON public.clinical_patient_conditions
  FOR SELECT TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p WHERE p.user_id=auth.uid()
    )
  );
CREATE POLICY "Service role manages clinical conditions"
  ON public.clinical_patient_conditions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Patients can read own clinical symptoms" ON public.clinical_symptom_observations;
DROP POLICY IF EXISTS "Service role manages clinical symptoms" ON public.clinical_symptom_observations;
CREATE POLICY "Patients can read own clinical symptoms"
  ON public.clinical_symptom_observations
  FOR SELECT TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p WHERE p.user_id=auth.uid()
    )
  );
CREATE POLICY "Service role manages clinical symptoms"
  ON public.clinical_symptom_observations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.clinical_patient_conditions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.clinical_symptom_observations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.clinical_patient_conditions TO authenticated;
GRANT SELECT ON TABLE public.clinical_symptom_observations TO authenticated;
GRANT ALL ON TABLE public.clinical_patient_conditions TO service_role;
GRANT ALL ON TABLE public.clinical_symptom_observations TO service_role;
