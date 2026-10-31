-- Read-only assertion after migration replay.
DO $verify$
DECLARE v_count integer;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.prescriptions'::regclass) THEN
   RAISE EXCEPTION 'Prescriptions RLS is disabled';
 END IF;
 SELECT count(*) INTO v_count FROM pg_policies
 WHERE schemaname='public' AND tablename='prescriptions'
 AND policyname IN ('Doctors can insert their own prescriptions',
 'Doctors can update their own draft prescriptions',
 'Doctors can view their own prescriptions',
 'Patients can view their own prescriptions')
 AND roles = ARRAY['public']::name[]
 AND (coalesce(qual,'')||coalesce(with_check,'')) ~* 'SELECT[[:space:]]+auth[.]uid[(][)]';
 IF v_count <> 4 THEN
   RAISE EXCEPTION 'Expected four unchanged-role prescriptions policies with initplan, got %',v_count;
 END IF;
END;
$verify$;
-- Additional production-only impersonation tests completed before/after migration:
-- a linked patient still sees 1 prescription, a linked doctor sees 3, anon sees 0.
-- These are sampled access counts, NOT the full clinician/patient E2E.
