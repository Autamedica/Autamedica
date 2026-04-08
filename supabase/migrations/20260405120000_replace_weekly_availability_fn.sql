CREATE OR REPLACE FUNCTION public.replace_weekly_availability(
  p_doctor_id uuid,
  p_rows jsonb
) RETURNS SETOF public.doctor_availability
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.doctor_availability WHERE doctor_id = p_doctor_id;
  INSERT INTO public.doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration, location, is_active)
  SELECT
    p_doctor_id,
    (r->>'day_of_week')::smallint,
    (r->>'start_time')::time,
    (r->>'end_time')::time,
    (r->>'slot_duration')::integer,
    r->>'location',
    COALESCE((r->>'is_active')::boolean, true)
  FROM jsonb_array_elements(p_rows) AS r;
  RETURN QUERY SELECT * FROM public.doctor_availability WHERE doctor_id = p_doctor_id ORDER BY day_of_week, start_time;
END;
$$;
