-- Applied and verified in production; preserve the exact migration ledger version.
ALTER POLICY "Service role manages clinical conditions" ON public.clinical_patient_conditions TO service_role;
ALTER POLICY "Service role manages clinical symptoms" ON public.clinical_symptom_observations TO service_role;
ALTER POLICY "Patients can read own clinical conditions" ON public.clinical_patient_conditions TO authenticated;
ALTER POLICY "Patients can read own clinical symptoms" ON public.clinical_symptom_observations TO authenticated;
REVOKE ALL ON TABLE public.clinical_patient_conditions, public.clinical_symptom_observations FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_orphaned_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_orphaned_profiles() TO service_role;
