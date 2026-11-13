-- Restrict direct API execution of existing internal trigger entrypoints.
-- Hosted Supabase can include platform-managed trigger functions absent locally.
DO $permissions$
DECLARE
  signature text;
  target regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.assert_p2p_chat_event()',
    'public.assign_dispatch_patient_id()',
    'public.audit_profile_changes()',
    'public.auto_create_ranking_metrics()',
    'public.check_appointment_conflict()',
    'public.enqueue_appointment_reminder()',
    'public.enqueue_certificate_notification()',
    'public.enqueue_community_comment_notifications()',
    'public.enqueue_community_topic_notifications()',
    'public.enqueue_prescription_notification()',
    'public.ensure_doctor_patient_relationship()',
    'public.ensure_numeric_id()',
    'public.ensure_role_specific_record()',
    'public.fn_audit_sensitive_change()',
    'public.handle_chat_notification()',
    'public.handle_new_user()',
    'public.handle_sync_user_avatar()',
    'public.handle_user_deleted()',
    'public.log_appointment_change()',
    'public.log_authorization_changes()',
    'public.log_medical_change()',
    'public.log_medical_record_access()',
    'public.log_recording_access()',
    'public.notify_on_duty_doctors_on_dispatch()',
    'public.process_anamnesis_extraction_silver_layer()',
    'public.rls_auto_enable()',
    'public.sync_call_to_appointment()',
    'public.trg_schedule_appointment_reminders()',
    'public.trigger_match_dispatch_doctors()',
    'public.trigger_recalculate_on_appointment()',
    'public.trigger_recalculate_on_doctor_community_comment()',
    'public.trigger_recalculate_on_doctor_community_reaction()',
    'public.trigger_recalculate_on_review()'
  ]
  LOOP
    target := to_regprocedure(signature);
    IF target IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', target);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target);
    END IF;
  END LOOP;
END;
$permissions$;
