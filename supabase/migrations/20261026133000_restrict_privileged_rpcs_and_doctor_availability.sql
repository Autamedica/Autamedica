-- Restrict legacy SECURITY DEFINER RPCs to trusted server-side clients.
-- These functions were executable by anonymous users in production on 2026-10-26.
-- Change is intentionally isolated from Android and from the currency migrations.
--
-- WARNING: deployment requires a call-site audit and synthetic-data tests.
-- service_role retains EXECUTE; user-facing availability editing stays enabled
-- for the owning doctor and approved system administrators.

REVOKE EXECUTE ON FUNCTION public.drain_notification_queue(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_cleanup_old_audit_logs(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_pharmacy_consultation_request(uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pay_appointment_with_patient_wallet(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_patient_wallet(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_reserve_benefit(uuid,uuid,integer,text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.drain_notification_queue(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_old_audit_logs(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_pharmacy_consultation_request(uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_appointment_with_patient_wallet(uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_patient_wallet(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_reserve_benefit(uuid,uuid,integer,text)
  TO service_role;

-- The existing implementation allowed ANY caller to replace ANY doctor's week.
-- Pin the search path and enforce the doctor/user relationship before mutation.
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
