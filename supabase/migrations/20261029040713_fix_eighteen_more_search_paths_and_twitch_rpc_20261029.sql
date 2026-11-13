-- Replay-safe search-path hardening. These optional legacy functions already
-- exist in production but may not exist in fresh local CI databases.
-- Do not create functions, grant new public privileges, or modify missing RPCs.
DO $guard$
DECLARE
  signature text;
  fn regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'growth_os.is_channel_enabled(text)',
    'growth_os.claim_next_topic(text)',
    'growth_os.resolve_topic(bigint,text,uuid,text)',
    'public.enforce_bridge_immutability()',
    'public.enforce_extraordinary_dose_review()',
    'public.enforce_substitution_controls()',
    'public.log_appointment_change()',
    'public.enforce_doctor_prescription_template_limit()',
    'public.sync_call_to_appointment()',
    'public.enqueue_appointment_reminder()',
    'public.enqueue_prescription_notification()',
    'public.get_pharmacy_tiers_status()',
    'public.handle_chat_notification()',
    'public.mark_overdue_appointments_no_show()',
    'public.schedule_appointment_reminders(uuid,text)',
    'public.detect_clinical_anomalies()',
    'public.cleanup_stuck_conversation_sessions(text)',
    'public.incrementar_puntos_twitch(text,integer)'
  ] LOOP
    fn := to_regprocedure(signature);
    IF fn IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog', fn);
    END IF;
  END LOOP;
  fn := to_regprocedure('public.incrementar_puntos_twitch(text,integer)');
  IF fn IS NOT NULL THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END IF;
END
$guard$;
