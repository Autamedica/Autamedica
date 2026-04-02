-- Resolve remaining Security Advisor warnings that are safe to address on the
-- current production plan:
--   1. Fix mutable search_path on application-owned public functions
--   2. Tighten overly permissive RLS policies flagged as always true

BEGIN;

-- Apply an explicit search_path to every application-owned public function that
-- still relies on the role/session default. Extension-owned functions are
-- excluded on purpose.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_extension'::regclass
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions',
      r.schema_name,
      r.function_name,
      r.args
    );
  END LOOP;
END
$$;

-- Only the server-side admin client should manage extraction rows end-to-end.
DROP POLICY IF EXISTS "Service role manages extractions" ON public.anamnesis_extractions;

CREATE POLICY "Service role manages extractions"
  ON public.anamnesis_extractions
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Audit rows are created from authenticated application activity and from the
-- backend service role. Keep inserts open for those contexts, but not
-- universally true.
DROP POLICY IF EXISTS "audit_logs_insert_system" ON public.audit_logs;

CREATE POLICY "audit_logs_insert_system"
  ON public.audit_logs
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    auth.uid() IS NOT NULL
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "system_insert_audit" ON public.auth_audit;

CREATE POLICY "system_insert_audit"
  ON public.auth_audit
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    auth.uid() IS NOT NULL
    OR auth.role() = 'service_role'
  );

COMMIT;
