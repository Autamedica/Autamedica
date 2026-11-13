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
