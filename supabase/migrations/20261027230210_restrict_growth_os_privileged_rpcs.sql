-- Migration already applied in production as 20261027230210.
-- Keep service-only internal Growth OS RPCs aligned with production.
REVOKE EXECUTE ON FUNCTION growth_os.claim_due_agent_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_os.dashboard_summary(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_os.enqueue_anamnesis_reminders(integer, interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_os.enqueue_nurturing_emails(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_os.is_notification_contact_suppressed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION growth_os.claim_due_agent_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION growth_os.dashboard_summary(integer) TO service_role;
GRANT EXECUTE ON FUNCTION growth_os.enqueue_anamnesis_reminders(integer, interval) TO service_role;
GRANT EXECUTE ON FUNCTION growth_os.enqueue_nurturing_emails(integer) TO service_role;
GRANT EXECUTE ON FUNCTION growth_os.is_notification_contact_suppressed(text, text) TO service_role;
