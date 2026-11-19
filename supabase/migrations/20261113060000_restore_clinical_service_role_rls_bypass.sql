-- Restore the service-role bypass after the clinical approval policy rewrite.
-- service_role is a trusted backend role and must not be gated by a doctor's approval.
-- Forward-only correction for databases that already applied
-- 20261111120000_enforce_clinical_approval_in_rls.sql.
BEGIN;

ALTER POLICY "service_role_full_access_clinical_states"
  ON public.clinical_case_states
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
