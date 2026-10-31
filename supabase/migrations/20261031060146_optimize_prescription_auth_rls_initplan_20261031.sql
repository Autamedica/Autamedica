-- Supabase production ledger: 20261031060146_optimize_prescription_auth_rls_initplan_20261031.
-- Keep ownership predicates, roles and status checks; only replace the stable
-- auth.uid() call with an initplan subquery as recommended by Supabase.
SET lock_timeout = '2s';
SET statement_timeout = '20s';
DO $rls$
DECLARE v record; v_using text; v_check text; v_count int := 0;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.prescriptions'::regclass) THEN
   RAISE EXCEPTION 'Prescriptions RLS disabled';
 END IF;
 FOR v IN SELECT * FROM pg_policies
  WHERE schemaname='public' AND tablename='prescriptions'
  AND policyname IN ('Doctors can insert their own prescriptions',
 'Doctors can update their own draft prescriptions',
 'Doctors can view their own prescriptions','Patients can view their own prescriptions')
 LOOP
 v_count:=v_count+1;
 IF v.roles IS DISTINCT FROM ARRAY['public']::name[]
    OR v.cmd NOT IN ('SELECT','INSERT','UPDATE')
    OR (coalesce(length(v.qual)-length(replace(v.qual,'auth.uid()','')),0)
       +coalesce(length(v.with_check)-length(replace(v.with_check,'auth.uid()','')),0)) <> length('auth.uid()')
 THEN RAISE EXCEPTION 'Unexpected policy before change: %',v.policyname; END IF;
 v_using:=CASE WHEN v.qual IS NULL THEN NULL ELSE replace(v.qual,'auth.uid()','(select auth.uid())') END;
 v_check:=CASE WHEN v.with_check IS NULL THEN NULL ELSE replace(v.with_check,'auth.uid()','(select auth.uid())') END;
 IF v.cmd='SELECT' AND v_using IS NOT NULL AND v_check IS NULL THEN
   EXECUTE format('ALTER POLICY %I ON public.prescriptions USING (%s)',v.policyname,v_using);
 ELSIF v.cmd='INSERT' AND v_using IS NULL AND v_check IS NOT NULL THEN
   EXECUTE format('ALTER POLICY %I ON public.prescriptions WITH CHECK (%s)',v.policyname,v_check);
 ELSIF v.cmd='UPDATE' AND v_using IS NOT NULL AND v_check IS NOT NULL THEN
   EXECUTE format('ALTER POLICY %I ON public.prescriptions USING (%s) WITH CHECK (%s)',v.policyname,v_using,v_check);
 ELSE RAISE EXCEPTION 'Policy shape mismatch: %',v.policyname; END IF;
 END LOOP;
 IF v_count<>4 THEN RAISE EXCEPTION 'Expected four prescriptions policies, got %',v_count; END IF;
 IF (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='prescriptions'
     AND policyname IN ('Doctors can insert their own prescriptions',
 'Doctors can update their own draft prescriptions',
 'Doctors can view their own prescriptions','Patients can view their own prescriptions')
     AND (coalesce(qual,'')||coalesce(with_check,'')) ~* 'SELECT[[:space:]]+auth[.]uid[(][)]')<>4
 THEN RAISE EXCEPTION 'New initplan expressions not persisted'; END IF;
END;
$rls$;
