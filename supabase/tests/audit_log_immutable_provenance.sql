-- Runs only on a throwaway CI Supabase database.
DO $guard$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.audit_logs'::regclass)
     OR has_table_privilege('anon','public.audit_logs','INSERT')
     OR has_table_privilege('authenticated','public.audit_logs','INSERT')
     OR NOT has_table_privilege('service_role','public.audit_logs','INSERT')
  THEN
    RAISE EXCEPTION 'Audit append-only access contracts are not satisfied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.fn_audit_sensitive_change()'::regprocedure AND prosecdef
  ) THEN
    RAISE EXCEPTION 'Trusted audit trigger writer is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='audit_logs'
      AND cmd IN ('INSERT','ALL') AND roles && ARRAY['authenticated','anon']::name[]
  ) THEN
    RAISE EXCEPTION 'An unsafe authenticated audit insertion policy remains';
  END IF;
END $guard$;

BEGIN;
SET LOCAL ROLE authenticated;
DO $deny$
BEGIN
  BEGIN
    INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
    VALUES (auth.uid(),'forged_audit_event','appointments',gen_random_uuid(),'{}'::jsonb);
    RAISE EXCEPTION 'Authenticated user forged an audit event';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $deny$;
ROLLBACK;
