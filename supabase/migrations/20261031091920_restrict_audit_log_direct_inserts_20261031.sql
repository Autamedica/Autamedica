-- Applied to Supabase production at ledger version 20261031091920; do not reapply.
-- Audit trail entries must only originate from trusted database triggers
-- and backend service-role code. Previously an authenticated client could
-- INSERT an arbitrary audit event via permissive public.audit_logs policies.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

DO $audit_hardening$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.audit_logs'::regclass) THEN
    RAISE EXCEPTION 'Audit table RLS disabled';
  END IF;

  -- No live trigger or RPC which writes audit_logs may depend on an
  -- authenticated caller's table grant: each audit writer runs as its owner.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prokind='f' AND n.nspname IN ('public','growth_os')
      AND (p.prosrc ILIKE '%INSERT INTO public.audit_logs%'
           OR p.prosrc ILIKE '%INSERT INTO audit_logs%')
      AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION 'Audit writer SECURITY INVOKER detected; abort';
  END IF;

  IF NOT has_table_privilege('service_role','public.audit_logs','INSERT') THEN
    RAISE EXCEPTION 'Trusted backend INSERT privilege absent';
  END IF;

  REVOKE INSERT ON TABLE public.audit_logs FROM PUBLIC,anon,authenticated;
  DROP POLICY IF EXISTS "Anyone authenticated can insert logs" ON public.audit_logs;
  DROP POLICY IF EXISTS audit_logs_insert_system ON public.audit_logs;

  IF has_table_privilege('anon','public.audit_logs','INSERT')
     OR has_table_privilege('authenticated','public.audit_logs','INSERT')
     OR NOT has_table_privilege('service_role','public.audit_logs','INSERT')
  THEN
    RAISE EXCEPTION 'Audit INSERT privilege invariant failed';
  END IF;
END;
$audit_hardening$;
