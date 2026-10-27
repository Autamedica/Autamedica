-- Migration already applied and verified in production as 20261027230347.
-- These SECURITY DEFINER functions are internal workers, trigger helpers, or
-- administrative calculations. Their API execution surface is service_role only.
REVOKE EXECUTE ON FUNCTION public.auto_revoke_expired_authorizations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_clinical_anomalies() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_doctor_badges(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_overdue_appointments_no_show() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_appointment_reminders(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_doctor_metrics(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_doctor_ranking_positions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_numeric_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_revoke_expired_authorizations() TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_clinical_anomalies() TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_doctor_badges(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_overdue_appointments_no_show() TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_appointment_reminders(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_doctor_metrics(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_doctor_ranking_positions() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_numeric_id() TO service_role;
