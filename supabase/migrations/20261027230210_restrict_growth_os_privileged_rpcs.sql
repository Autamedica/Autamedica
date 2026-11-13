-- Production already applied this migration as version 20261027230210.
-- Some RPC definitions were previously created out-of-band. Keep clean replay
-- safe; the forward reconciliation migration restores and locks them.
DO $migration$
BEGIN
  IF to_regprocedure('growth_os.claim_due_agent_jobs(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION growth_os.claim_due_agent_jobs(integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION growth_os.claim_due_agent_jobs(integer) TO service_role';
  END IF;
  IF to_regprocedure('growth_os.dashboard_summary(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION growth_os.dashboard_summary(integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION growth_os.dashboard_summary(integer) TO service_role';
  END IF;
  IF to_regprocedure('growth_os.enqueue_anamnesis_reminders(integer,interval)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION growth_os.enqueue_anamnesis_reminders(integer,interval) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION growth_os.enqueue_anamnesis_reminders(integer,interval) TO service_role';
  END IF;
  IF to_regprocedure('growth_os.enqueue_nurturing_emails(integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION growth_os.enqueue_nurturing_emails(integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION growth_os.enqueue_nurturing_emails(integer) TO service_role';
  END IF;
  IF to_regprocedure('growth_os.is_notification_contact_suppressed(text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION growth_os.is_notification_contact_suppressed(text,text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION growth_os.is_notification_contact_suppressed(text,text) TO service_role';
  END IF;
END;
$migration$;
