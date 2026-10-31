-- Database-only regression; always rolls back and never advances sequences.
BEGIN;
CREATE TEMP TABLE trigger_acl_probe(numeric_id bigint);
CREATE TRIGGER probe_before_insert BEFORE INSERT ON trigger_acl_probe
FOR EACH ROW EXECUTE FUNCTION public.ensure_numeric_id();
GRANT INSERT, SELECT ON trigger_acl_probe TO anon, authenticated;
SET LOCAL ROLE anon;
INSERT INTO trigger_acl_probe VALUES (-1);
RESET ROLE;
SET LOCAL ROLE authenticated;
INSERT INTO trigger_acl_probe VALUES (-2);
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM trigger_acl_probe) <> 2 THEN
    RAISE EXCEPTION 'Existing trigger no longer runs for client roles';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'Internal trigger function is directly executable by client roles';
  END IF;
END;
$$;
SELECT 'PASS: trigger runtime preserved, direct client execution blocked' AS result;
ROLLBACK;
