-- Query-plan and authorization-contract regression. No clinical writes.
BEGIN ISOLATION LEVEL REPEATABLE READ;
DO $contracts$
DECLARE p record;
BEGIN
  IF (SELECT count(*) FROM (VALUES
      ('clinical_case_states','doctors_view_patient_clinical_states'),
      ('clinical_case_states','patients_update_own_clinical_states'),
      ('clinical_case_states','patients_upsert_own_clinical_states'),
      ('clinical_case_states','patients_view_own_clinical_states'),
      ('clinical_case_states','service_role_full_access_clinical_states'),
      ('medical_records','medical_records_delete_admin'),
      ('medical_records','medical_records_insert_doctor'),
      ('medical_records','medical_records_select_scoped'),
      ('medical_records','medical_records_soft_delete'),
      ('medical_records','medical_records_update_authorized'),
      ('profiles','Doctors global patient search'),
      ('profiles','profiles_delete_admin'),
      ('profiles','profiles_select_self_or_admin')
    ) expected(relation_name,policy_name) JOIN pg_policies actual ON actual.schemaname='public' AND actual.tablename=expected.relation_name AND actual.policyname=expected.policy_name) <> 13 THEN
    RAISE EXCEPTION 'Required clinical performance policy missing';
  END IF;
  FOR p IN SELECT polname,polroles,pg_get_expr(polqual,polrelid) qual,pg_get_expr(polwithcheck,polrelid) check_expr
    FROM pg_policy WHERE polrelid='public.clinical_case_states'::regclass LOOP
    IF p.polname IN ('patients_view_own_clinical_states','patients_update_own_clinical_states','patients_upsert_own_clinical_states','doctors_view_patient_clinical_states')
      AND p.polroles <> ARRAY['authenticated'::regrole::oid] THEN
      RAISE EXCEPTION 'Clinical user policy is not scoped to authenticated: %',p.polname;
    END IF;
    IF p.polname='service_role_full_access_clinical_states'
      AND (p.polroles <> ARRAY['service_role'::regrole::oid] OR p.qual IS DISTINCT FROM 'true' OR p.check_expr IS DISTINCT FROM 'true') THEN
      RAISE EXCEPTION 'Clinical service policy contract changed';
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE
      (polrelid='public.medical_records'::regclass AND polname='medical_records_update_authorized'
       OR polrelid='public.clinical_case_states'::regclass AND polname='patients_update_own_clinical_states')
      AND polwithcheck IS NOT NULL
  ) THEN RAISE EXCEPTION 'Implicit UPDATE WITH CHECK changed'; END IF;
  IF (SELECT pg_get_expr(polwithcheck,polrelid) FROM pg_policy WHERE polrelid='public.medical_records'::regclass AND polname='medical_records_soft_delete') IS DISTINCT FROM '(deleted_at IS NOT NULL)' THEN
    RAISE EXCEPTION 'Soft-delete guard changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='medical_records'
      AND policyname='medical_records_insert_doctor'
      AND with_check LIKE '%doctor_has_patient_access(p.user_id)%'
      AND with_check LIKE '%deleted_at IS NULL%'
  ) THEN RAISE EXCEPTION 'Row-correlated patient access guard lost'; END IF;
END;
$contracts$;

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000"}',true),
       set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true),
       set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
DO $plans$
DECLARE relation_name text; plan json; initplans int; max_loops int; cached_role_check boolean; n bigint;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['medical_records','profiles'] LOOP
    EXECUTE format('EXPLAIN (ANALYZE,VERBOSE,FORMAT JSON) SELECT count(*) FROM public.%I',relation_name) INTO plan;
    WITH RECURSIVE nodes(node) AS (
      SELECT (plan::jsonb)->0->'Plan'
      UNION ALL
      SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(coalesce(node->'Plans','[]'::jsonb)) child
    )
    SELECT count(*),max(coalesce((node->>'Actual Loops')::int,0)),
      bool_or(coalesce(node->'Output','[]'::jsonb)::text ~ '(is_system_admin|is_platform_or_org_admin)')
    INTO initplans,max_loops,cached_role_check FROM nodes WHERE node->>'Parent Relationship'='InitPlan';
    IF initplans=0 OR max_loops>1 OR cached_role_check IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Role check is not statement-scoped on %',relation_name;
    END IF;
  END LOOP;
  BEGIN
    SELECT count(*) INTO n FROM public.clinical_case_states;
  EXCEPTION WHEN insufficient_privilege THEN
    -- No table-level SELECT is a valid denial for an unprivileged subject.
    n := 0;
  END;
  IF n<>0 THEN RAISE EXCEPTION 'Nonexistent subject sees clinical states'; END IF;
END;
$plans$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true),
       set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claim.role','anon',true);
SET LOCAL ROLE anon;
DO $anonymous$
DECLARE visible_rows boolean := false;
BEGIN
  BEGIN
    SELECT EXISTS(SELECT 1 FROM public.clinical_case_states)
      OR EXISTS(SELECT 1 FROM public.medical_records) INTO visible_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    -- A denied read proves these clinical relations are not exposed to anon.
    visible_rows := false;
  END;
  IF visible_rows THEN
    RAISE EXCEPTION 'Anonymous clinical read became visible';
  END IF;
END;
$anonymous$;
RESET ROLE;
SELECT 'PASS: statement-scoped role checks and clinical authorization guards' AS result;
ROLLBACK;
