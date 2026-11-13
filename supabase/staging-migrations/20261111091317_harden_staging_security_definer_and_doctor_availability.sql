-- Match production's empty search_path on application-owned SECURITY DEFINER routines.
ALTER FUNCTION public.cleanup_stuck_conversation_sessions(text) SET search_path = '';
ALTER FUNCTION public.detect_clinical_anomalies() SET search_path = '';
ALTER FUNCTION public.drain_notification_queue(integer) SET search_path = '';
ALTER FUNCTION public.enqueue_appointment_reminder() SET search_path = '';
ALTER FUNCTION public.enqueue_notification(uuid,text,text,text,text,jsonb,text,timestamptz) SET search_path = '';
ALTER FUNCTION public.enqueue_prescription_notification() SET search_path = '';
ALTER FUNCTION public.handle_chat_notification() SET search_path = '';
ALTER FUNCTION public.handle_sync_user_avatar() SET search_path = '';
ALTER FUNCTION public.incrementar_puntos_twitch(text,integer) SET search_path = '';
ALTER FUNCTION public.log_appointment_change() SET search_path = '';
ALTER FUNCTION public.log_clinical_rule_evaluation_transaction(uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) SET search_path = '';
ALTER FUNCTION public.mark_overdue_appointments_no_show() SET search_path = '';
ALTER FUNCTION public.process_anamnesis_extraction_silver_layer() SET search_path = '';
ALTER FUNCTION public.schedule_appointment_reminders(uuid,text) SET search_path = '';
ALTER FUNCTION public.sync_call_to_appointment() SET search_path = '';
ALTER FUNCTION public.take_triage_case(uuid) SET search_path = '';
ALTER FUNCTION public.trg_schedule_appointment_reminders() SET search_path = '';

-- Restore the production-hardened implementation: doctors can only replace their own
-- availability; platform admins and service_role retain their intended operations.
CREATE OR REPLACE FUNCTION public.replace_weekly_availability(
  p_doctor_id uuid,
  p_rows jsonb
) RETURNS SETOF public.doctor_availability
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := (SELECT auth.uid());

  IF p_doctor_id IS NULL OR p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'invalid_availability_payload';
  END IF;

  IF jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'availability_limit_exceeded';
  END IF;

  IF NOT (
    (v_user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = p_doctor_id AND d.user_id = v_user_id
    ))
    OR (v_user_id IS NOT NULL AND public.is_system_admin())
    OR COALESCE((auth.jwt()->>'role' = 'service_role'), false)
  ) THEN
    RAISE EXCEPTION 'availability_access_denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.doctor_availability WHERE doctor_id = p_doctor_id;

  INSERT INTO public.doctor_availability
    (doctor_id, day_of_week, start_time, end_time, slot_duration, location, is_active)
  SELECT
    p_doctor_id,
    (r->>'day_of_week')::smallint,
    (r->>'start_time')::time,
    (r->>'end_time')::time,
    (r->>'slot_duration')::integer,
    r->>'location',
    COALESCE((r->>'is_active')::boolean, true)
  FROM jsonb_array_elements(p_rows) AS r;

  RETURN QUERY SELECT *
  FROM public.doctor_availability
  WHERE doctor_id = p_doctor_id
  ORDER BY day_of_week, start_time;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.replace_weekly_availability(uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_weekly_availability(uuid,jsonb)
  TO authenticated, service_role;
