-- Allow authenticated RLS evaluation of the non-sensitive clinician approval predicate.
-- The function is SECURITY DEFINER, returns only a boolean, and keeps its internal
-- doctor/license evidence queries outside the caller's privileges. No table access
-- or other app_private function execution is granted here.
BEGIN;

GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_doctor_dispatch_approved(uuid)
  TO authenticated;

COMMENT ON FUNCTION app_private.is_doctor_dispatch_approved(uuid) IS
  'Boolean-only clinician dispatch approval predicate. SECURITY DEFINER; executable by authenticated so scoped pharmacy dispatch RLS policies can evaluate clinician eligibility.';

COMMIT;
