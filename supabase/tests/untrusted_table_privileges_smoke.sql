-- Read-only metadata assertions: can run against production or complete staging.
-- Confirm ordinary public tables are protected. PostGIS spatial_ref_sys is
-- an owner-managed extension exception and needs Supabase-side remediation.
DO $guard$
DECLARE affected_count int; v record;
BEGIN
  SELECT count(*) INTO affected_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND c.relname <> 'spatial_ref_sys'
    AND (
      has_table_privilege('anon',c.oid,'TRUNCATE')
      OR has_table_privilege('authenticated',c.oid,'TRUNCATE')
      OR has_table_privilege('anon',c.oid,'TRIGGER')
      OR has_table_privilege('authenticated',c.oid,'TRIGGER')
      OR has_table_privilege('anon',c.oid,'REFERENCES')
      OR has_table_privilege('authenticated',c.oid,'REFERENCES')
    );
  IF affected_count <> 0 THEN
    RAISE EXCEPTION 'Dangerous API role privileges still exist on % unprotected public tables',affected_count;
  END IF;

  IF to_regclass('public.pharmacy_dispatch_requests') IS NOT NULL THEN
    IF has_table_privilege('anon','public.pharmacy_dispatch_requests','SELECT')
      OR has_table_privilege('anon','public.pharmacy_dispatch_requests','UPDATE')
    THEN RAISE EXCEPTION 'Anonymous dispatch read/update unexpectedly available'; END IF;
    -- Guest intake must go through the signed, validated server API.
    -- A DNI/CPF alone is not authorization to create/read a clinical identity.
    IF has_table_privilege('anon','public.pharmacy_dispatch_requests','INSERT') THEN
      RAISE EXCEPTION 'Direct anonymous pharmacy dispatch INSERT unexpectedly granted';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public'
        AND tablename='pharmacy_dispatch_requests'
        AND policyname='pharmacy_dispatch_requests_insert_kiosk_or_owner'
        AND roles='{authenticated}'::name[]
    ) THEN RAISE EXCEPTION 'Authenticated owner-scoped dispatch INSERT policy missing'; END IF;
    IF NOT has_table_privilege('service_role','public.pharmacy_dispatch_requests','SELECT') THEN
      RAISE EXCEPTION 'Internal dispatch access unexpectedly removed';
    END IF;
  END IF;
END;
$guard$;
