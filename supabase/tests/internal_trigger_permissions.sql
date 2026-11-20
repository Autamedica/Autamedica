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

-- Growth OS is an internal worker/trigger schema. No SECURITY DEFINER routine
-- in it may be directly executed by API client roles. Existing database triggers
-- remain attached and service_role retains the operational execution grant.
DO $growth_os_acl$
DECLARE
  signature text;
  target regprocedure;
  checked_functions integer := 0;
  checked_triggers integer := 0;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'growth_os.enqueue_appointment_cancellations()',
    'growth_os.enqueue_appointment_email_reminders()',
    'growth_os.enqueue_concierge_agent_job()',
    'growth_os.enqueue_doctor_anamnesis_ready()',
    'growth_os.enqueue_doctor_confirmed_appointment()',
    'growth_os.enqueue_doctor_new_appointment()',
    'growth_os.enqueue_patient_medical_order_ready()',
    'growth_os.enqueue_patient_prescription_ready()',
    'growth_os.enqueue_welcome_email()',
    'growth_os.dashboard_summary(integer)',
    'growth_os.enqueue_anamnesis_reminders(integer,interval)',
    'growth_os.enqueue_nurturing_emails(integer)',
    'growth_os.is_notification_contact_suppressed(text,text)'
  ] LOOP
    target := to_regprocedure(signature);
    IF target IS NULL THEN
      CONTINUE;
    END IF;
    checked_functions := checked_functions + 1;

    IF has_function_privilege('anon', target, 'EXECUTE')
       OR has_function_privilege('authenticated', target, 'EXECUTE')
       OR NOT has_function_privilege('service_role', target, 'EXECUTE') THEN
      RAISE EXCEPTION 'Growth OS SECURITY DEFINER ACL is not service-only: %', signature;
    END IF;

    IF pg_get_function_result(target) = 'trigger' THEN
      checked_triggers := checked_triggers + 1;
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgfoid = target AND NOT tgisinternal
      ) THEN
        RAISE EXCEPTION 'Growth OS trigger function is no longer attached: %', signature;
      END IF;
    END IF;
  END LOOP;

  IF checked_functions < 8 OR checked_triggers < 8 THEN
    RAISE EXCEPTION 'Expected Growth OS trigger/service routines were not found: functions %, triggers %',
      checked_functions, checked_triggers;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'growth_os'
      AND p.prosecdef
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'A Growth OS SECURITY DEFINER function remains executable by an API client role';
  END IF;
END;
$growth_os_acl$;

-- Explicit allow-list: do not revoke the existing anonymous guest-pharmacy
-- capability RPCs or the two intentionally public, non-personal aggregate/config helpers.
DO $guest_rpc_allowlist$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.create_pharmacy_consultation_request(uuid,text,text,text,text,text,text)',
    'public.get_pharmacy_consultation_request_status(uuid)',
    'public.cancel_pharmacy_consultation_request(uuid,text)',
    'public.get_content_mode()',
    'public.get_country_on_duty_capacity(text)'
  ] LOOP
    target := to_regprocedure(signature);
    -- The content-mode helper is optional on installations that do not enable
    -- the public content-mode feature; if installed, it must remain public.
    IF target IS NULL AND signature = 'public.get_content_mode()' THEN
      CONTINUE;
    END IF;
    IF target IS NULL
       OR NOT has_function_privilege('anon', target, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', target, 'EXECUTE')
       OR NOT has_function_privilege('service_role', target, 'EXECUTE') THEN
      RAISE EXCEPTION 'Intended guest/public RPC contract was changed: %', signature;
    END IF;
  END LOOP;
END;
$guest_rpc_allowlist$;

SELECT 'PASS: both client roles fired the trigger; direct execution blocked; service access preserved' AS result;
ROLLBACK;
