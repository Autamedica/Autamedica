-- Restrict internal Growth OS SECURITY DEFINER functions to service_role.
--
-- growth_os is an internal worker/trigger schema (not exposed by supabase/config.toml).
-- Production already has the service-only ACL for these routines, but staging drifted
-- and re-granted PUBLIC/anon/authenticated through old/default ACLs. This migration
-- reasserts the internal-only contract on every SECURITY DEFINER function in growth_os.
--
-- Deliberate public exceptions are outside this schema and are not touched:
--   * create_pharmacy_consultation_request / get_pharmacy_consultation_request_status /
--     cancel_pharmacy_consultation_request: current guest pharmacy capability flow.
--   * get_content_mode: public web configuration helper.
--   * get_country_on_duty_capacity: public country-scoped aggregate only.
-- Extension-owned GraphQL and PostGIS routines are also left untouched.
BEGIN;

DO $growth_os_acl$
DECLARE
  v_function record;
  v_revoked integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'growth_os'
      AND p.prosecdef IS TRUE
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
    ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_function.signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      v_function.signature
    );
    v_revoked := v_revoked + 1;
  END LOOP;

  -- A clean replay may already have the service-only ACL from earlier migrations.
  -- Zero changes is therefore a valid idempotent result.
  RAISE NOTICE 'Growth OS SECURITY DEFINER functions hardened in this pass: %', v_revoked;
END;
$growth_os_acl$;

COMMIT;
