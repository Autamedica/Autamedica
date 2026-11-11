-- Bring staging's public doctor RPCs up to the country-scoped production behavior.
CREATE OR REPLACE FUNCTION app_private.viewer_care_country()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT CASE WHEN pr.role='doctor' THEN d.care_country ELSE p.care_country END
  FROM public.profiles pr
  LEFT JOIN public.patients p ON p.user_id=pr.user_id AND p.active IS TRUE
  LEFT JOIN public.doctors d ON d.user_id=pr.user_id AND d.active IS TRUE
  WHERE pr.user_id=auth.uid() AND pr.active IS TRUE LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION app_private.can_view_country_doctor(p_doctor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.doctors d WHERE d.id=p_doctor_id AND (
      d.user_id=auth.uid() OR public.is_system_admin() OR
      (d.active IS TRUE AND d.care_country=app_private.viewer_care_country())
    )
  );
$function$;

GRANT USAGE ON SCHEMA app_private TO authenticated;
REVOKE ALL ON FUNCTION app_private.viewer_care_country(),app_private.can_view_country_doctor(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.viewer_care_country(),app_private.can_view_country_doctor(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_doctor_busy_slots(
  p_doctor_id uuid, p_start_date date, p_end_date date
) RETURNS TABLE(start_time timestamptz, end_time timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = 'public'
AS $function$
  SELECT a.start_time,
         COALESCE(a.end_time, a.start_time + (COALESCE(a.duration_minutes,30) || ' minutes')::interval)
  FROM public.appointments a
  WHERE a.doctor_id=p_doctor_id
    AND (auth.role()='service_role' OR app_private.can_view_country_doctor(p_doctor_id))
    AND a.start_time >= (p_start_date::timestamp AT TIME ZONE 'UTC')
    AND a.start_time < ((p_end_date+1)::timestamp AT TIME ZONE 'UTC')
    AND a.status NOT IN ('cancelled','no_show','rejected');
$function$;

CREATE OR REPLACE FUNCTION public.get_duty_doctors_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public','pg_temp'
AS $function$
DECLARE v_result jsonb;
BEGIN
  WITH unnested_tiers AS (
    SELECT unnest(active_tiers) AS tier, current_active_request_id
    FROM public.doctor_duty_status dds
    WHERE is_on_duty IS TRUE
      AND EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id=dds.doctor_id AND d.active IS TRUE
          AND d.care_country=app_private.viewer_care_country()
      )
      AND last_heartbeat_at > (NOW()-INTERVAL '90 seconds')
  ),
  grouped_counts AS (
    SELECT tier,
           count(*)::int AS online_count,
           count(*) FILTER (WHERE current_active_request_id IS NULL)::int AS free_count
    FROM unnested_tiers GROUP BY tier
  )
  SELECT jsonb_object_agg(
    tier,jsonb_build_object('online_count',online_count,'free_count',free_count)
  ) INTO v_result
  FROM grouped_counts;
  RETURN COALESCE(v_result,'{}'::jsonb);
END;
$function$;
