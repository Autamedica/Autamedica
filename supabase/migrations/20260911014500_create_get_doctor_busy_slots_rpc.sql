-- Function to fetch doctor's busy time ranges without violating RLS or exposing patient details.
-- Used by Android and web scheduling components to compute real-time available appointment slots.

CREATE OR REPLACE FUNCTION public.get_doctor_busy_slots(
    p_doctor_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS TABLE (
    start_time timestamptz,
    end_time timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        a.start_time,
        COALESCE(a.end_time, a.start_time + (COALESCE(a.duration_minutes, 30) || ' minutes')::interval) AS end_time
    FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND a.start_time >= (p_start_date::timestamp at time zone 'UTC')
      AND a.start_time < ((p_end_date + 1)::timestamp at time zone 'UTC')
      AND a.status NOT IN ('cancelled', 'no_show', 'rejected');
$$;

-- Allow authenticated and anonymous users to check availability ranges
GRANT EXECUTE ON FUNCTION public.get_doctor_busy_slots(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_doctor_busy_slots(uuid, date, date) TO anon;

COMMENT ON FUNCTION public.get_doctor_busy_slots(uuid, date, date) IS
  'Returns non-cancelled start and end times for a doctor in a date range with SECURITY DEFINER to bypass patient-scoped RLS safely without exposing PII.';
