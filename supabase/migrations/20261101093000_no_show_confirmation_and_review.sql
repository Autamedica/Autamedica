-- Safety containment: lack of a completed attendance event is not proof of a no-show.
-- Previous job silently marked scheduled/confirmed appointments as 'no_show'
-- 30 min after end time, even when payments existed or service was offline.
-- Keep function signature/cron compatibility, but do not mutate clinical history.
-- Explicit clinician-confirmed absence remains possible through existing authorized
-- transition endpoints. Historical statuses require independent review.
CREATE OR REPLACE FUNCTION public.mark_overdue_appointments_no_show()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $no_show_safe$
BEGIN
  RETURN 0;
END;
$no_show_safe$;

COMMENT ON FUNCTION public.mark_overdue_appointments_no_show()
 IS 'Suspended automatic no_show classification: elapsed time alone cannot prove non-attendance. Returns 0; clinical/admin confirmation required.';

-- Restore previous restricted invocation surface (service-role workers only).
REVOKE EXECUTE ON FUNCTION public.mark_overdue_appointments_no_show()
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_overdue_appointments_no_show() TO service_role;

-- Aggregate-only review query (for trusted administrators). No patient identifiers.
-- This reports POTENTIAL overdue bookings without silently rewriting their status.
CREATE OR REPLACE FUNCTION public.get_overdue_appointments_review_summary()
RETURNS TABLE (overdue_total bigint, overdue_with_approved_payment bigint, historic_no_show_with_approved_payment bigint)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'pg_catalog'
AS $summary$
  SELECT
    (SELECT count(*) FROM public.appointments a
      WHERE a.deleted_at IS NULL
        AND a.status IN ('scheduled', 'confirmed')
        AND COALESCE(a.end_time, a.start_time + make_interval(mins => COALESCE(a.duration_minutes,30)))
          < now() - interval '30 minutes') AS overdue_total,
    (SELECT count(DISTINCT a.id) FROM public.appointments a
      JOIN public.appointment_payments p ON p.appointment_id = a.id AND p.status = 'approved'
      WHERE a.deleted_at IS NULL
        AND a.status IN ('scheduled', 'confirmed')
        AND COALESCE(a.end_time, a.start_time + make_interval(mins => COALESCE(a.duration_minutes,30)))
          < now() - interval '30 minutes') AS overdue_with_approved_payment,
    (SELECT count(DISTINCT a.id) FROM public.appointments a
      JOIN public.appointment_payments p ON p.appointment_id = a.id AND p.status = 'approved'
      WHERE a.deleted_at IS NULL AND a.status = 'no_show') AS historic_no_show_with_approved_payment;
$summary$;

REVOKE ALL ON FUNCTION public.get_overdue_appointments_review_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_appointments_review_summary() TO service_role;
