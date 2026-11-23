CREATE OR REPLACE FUNCTION public.get_country_on_duty_capacity(p_care_country text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF p_care_country IS NULL OR p_care_country NOT IN ('AR', 'BR') THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::integer
    INTO v_count
  FROM public.doctors d
  JOIN public.doctor_duty_status s ON s.doctor_id = d.id
  WHERE d.care_country = p_care_country
    AND d.active IS TRUE
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND NULLIF(btrim(d.license_number), '') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND s.is_on_duty IS TRUE
    AND s.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND s.current_active_request_id IS NULL
    AND (
      s.active_tiers IS NULL
      OR cardinality(s.active_tiers) = 0
      OR 'general'::public.dispatch_tier_category = ANY(s.active_tiers)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.dispatch_offers o
      WHERE o.doctor_id = d.id
        AND o.status = 'pending'
        AND o.expires_at > NOW()
    );

  RETURN COALESCE(v_count, 0);
END;
$function$;
