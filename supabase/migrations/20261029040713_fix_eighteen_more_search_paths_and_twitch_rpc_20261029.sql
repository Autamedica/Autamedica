-- Fix search paths and restrict the unused legacy privileged Twitch score RPC.
-- Mirrored from already applied AutaMedica production migration on 2026-10-29.
ALTER FUNCTION growth_os.is_channel_enabled(text) SET search_path = pg_catalog;
ALTER FUNCTION growth_os.claim_next_topic(text) SET search_path = pg_catalog;
ALTER FUNCTION growth_os.resolve_topic(bigint,text,uuid,text) SET search_path = pg_catalog;
ALTER FUNCTION public.enforce_bridge_immutability() SET search_path = pg_catalog;
ALTER FUNCTION public.enforce_extraordinary_dose_review() SET search_path = pg_catalog;
ALTER FUNCTION public.enforce_substitution_controls() SET search_path = pg_catalog;
ALTER FUNCTION public.log_appointment_change() SET search_path = pg_catalog;
ALTER FUNCTION public.enforce_doctor_prescription_template_limit() SET search_path = pg_catalog;
ALTER FUNCTION public.sync_call_to_appointment() SET search_path = pg_catalog;
ALTER FUNCTION public.enqueue_appointment_reminder() SET search_path = pg_catalog;
ALTER FUNCTION public.enqueue_prescription_notification() SET search_path = pg_catalog;
ALTER FUNCTION public.get_pharmacy_tiers_status() SET search_path = pg_catalog;
ALTER FUNCTION public.handle_chat_notification() SET search_path = pg_catalog;
ALTER FUNCTION public.mark_overdue_appointments_no_show() SET search_path = pg_catalog;
ALTER FUNCTION public.schedule_appointment_reminders(uuid,text) SET search_path = pg_catalog;
ALTER FUNCTION public.detect_clinical_anomalies() SET search_path = pg_catalog;
ALTER FUNCTION public.cleanup_stuck_conversation_sessions(text) SET search_path = pg_catalog;
ALTER FUNCTION public.incrementar_puntos_twitch(text,integer) SET search_path = pg_catalog;
REVOKE EXECUTE ON FUNCTION public.incrementar_puntos_twitch(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.incrementar_puntos_twitch(text,integer) TO service_role;
