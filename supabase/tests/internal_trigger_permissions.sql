-- Rollback-only regression: no clinical rows or sequence advancement.
BEGIN;
CREATE TEMP TABLE trigger_acl_probe(numeric_id bigint);
CREATE TRIGGER probe_before_insert BEFORE INSERT ON trigger_acl_probe
FOR EACH ROW EXECUTE FUNCTION public.ensure_numeric_id();
GRANT INSERT, SELECT ON trigger_acl_probe TO anon, authenticated;
SET LOCAL ROLE anon;
DO $probe$
DECLARE plan json;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) INSERT INTO pg_temp.trigger_acl_probe VALUES (-1)' INTO plan;
  IF NOT EXISTS (
    SELECT 1 FROM json_array_elements(plan->0->'Triggers') AS entry
    WHERE entry->>'Trigger Name' = 'probe_before_insert'
      AND (entry->>'Calls')::integer = 1
  ) THEN
    RAISE EXCEPTION 'Existing trigger did not execute for anon';
  END IF;
END;
$probe$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $probe$
DECLARE plan json;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) INSERT INTO pg_temp.trigger_acl_probe VALUES (-2)' INTO plan;
  IF NOT EXISTS (
    SELECT 1 FROM json_array_elements(plan->0->'Triggers') AS entry
    WHERE entry->>'Trigger Name' = 'probe_before_insert'
      AND (entry->>'Calls')::integer = 1
  ) THEN
    RAISE EXCEPTION 'Existing trigger did not execute for authenticated';
  END IF;
END;
$probe$;
RESET ROLE;
DO $check$
BEGIN
  IF (SELECT count(*) FROM trigger_acl_probe) <> 2 THEN
    RAISE EXCEPTION 'Trigger regression inserts did not complete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)
      AND pg_get_userbyid(p.proowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'Internal trigger privileges do not match the service-only contract';
  END IF;
END;
$check$;
SELECT 'PASS: both client roles fired the trigger; direct execution blocked; service access preserved' AS result;
ROLLBACK;
