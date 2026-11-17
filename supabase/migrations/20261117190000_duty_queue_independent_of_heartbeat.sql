-- Duty eligibility is an explicit physician decision, not a foreground heartbeat.
-- The app's foreground service and FCM improve reachability, but the 30s offer
-- timeout is what advances disconnected/unresponsive physicians to the next one.
-- Keep clinical approval, licence, country, tier, busy-state and single-offer guards.
BEGIN;

DO $capacity$
DECLARE
  v_definition text;
  v_old text := $old$    AND s.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
$old$;
BEGIN
  SELECT pg_get_functiondef('public.get_country_on_duty_capacity(text)'::regprocedure)
    INTO v_definition;
  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, '');
    EXECUTE v_definition;
  ELSIF position('last_heartbeat_at' IN lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Unexpected country capacity heartbeat predicate; refusing unsafe migration';
  END IF;
END;
$capacity$;

DO $active_doctors$
DECLARE
  v_definition text;
  v_old text := $old$      AND dds.last_heartbeat_at > (NOW() - INTERVAL '90 seconds');
$old$;
  v_status_old text := $old$                THEN 'En línea'
$old$;
  v_status_new text := $new$                THEN CASE WHEN d.care_country='BR' THEN 'De plantão' ELSE 'De guardia' END
$new$;
BEGIN
  SELECT pg_get_functiondef('public.get_active_on_duty_doctors()'::regprocedure)
    INTO v_definition;
  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, ';');
  ELSIF position('last_heartbeat_at' IN lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Unexpected active-doctor heartbeat predicate; refusing unsafe migration';
  END IF;

  IF position(v_status_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_status_old, v_status_new);
  END IF;

  EXECUTE v_definition;
END;
$active_doctors$;

-- The offer remains individually assigned for 30 seconds. Stale heartbeat
-- and absence of FCM token do not erase a doctor's active guard membership.
DO $matcher$
DECLARE
  v_definition text;
  v_old text := $old$    AND (
      dds.last_heartbeat_at>now()-interval '90 seconds'
      OR EXISTS (
        SELECT 1 FROM public.profiles fcm
        WHERE fcm.user_id=d.user_id AND NULLIF(btrim(fcm.fcm_token),'') IS NOT NULL
      )
    )
$old$;
  v_new_order text := $new$  ORDER BY (
    SELECT CASE
      WHEN COUNT(*) = 0 THEN 1::numeric
      ELSE COUNT(*) FILTER (WHERE recent.status='accepted')::numeric / COUNT(*)::numeric
    END
    FROM (
      SELECT offer.status
      FROM public.dispatch_offers offer
      WHERE offer.doctor_id=d.id
      ORDER BY offer.offered_at DESC, offer.id DESC
      LIMIT 20
    ) recent
  ) DESC,
  (
    SELECT MAX(recent.offered_at)
    FROM (
      SELECT offer.offered_at
      FROM public.dispatch_offers offer
      WHERE offer.doctor_id=d.id
      ORDER BY offer.offered_at DESC, offer.id DESC
      LIMIT 20
    ) recent
  ) ASC NULLS FIRST,
  dds.duty_started_at ASC NULLS FIRST,
  d.id ASC
$ new$;
BEGIN
  SELECT pg_get_functiondef(
    'app_private.match_dispatch_doctors_without_switch(uuid)'::regprocedure
  ) INTO v_definition;

  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, '');
  ELSIF position('last_heartbeat_at>now()-interval ''90 seconds''' IN lower(v_definition)) > 0
     OR position('fcm_token' IN lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Unexpected matcher reachability predicate; refusing unsafe migration';
  END IF;

  IF position('ORDER BY dds.duty_started_at ASC' IN v_definition) > 0 THEN
    v_definition := replace(v_definition,
      'ORDER BY dds.duty_started_at ASC',
      substring(v_new_order from 3 for length(v_new_order)-4));
  ELSIF position('recent.status=''accepted''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected matcher ordering; refusing unsafe migration';
  END IF;

  EXECUTE v_definition;
END;
$matcher$;

-- A guard activation/reconnection may dispatch a queued request regardless of
-- whether a previous heartbeat exists. The 30s offer expiry advances the queue.
DO $queue_trigger$
DECLARE
  v_definition text;
  v_old text := $old$     OR NEW.last_heartbeat_at IS NULL
     OR NEW.last_heartbeat_at <= NOW() - INTERVAL '90 seconds'
$old$;
BEGIN
  SELECT pg_get_functiondef(
    'app_private.dispatch_waiting_patient_on_doctor_presence()'::regprocedure
  ) INTO v_definition;

  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, '');
  ELSIF position('new.last_heartbeat_at' IN lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Unexpected queue trigger heartbeat predicate; refusing unsafe migration';
  END IF;
  EXECUTE v_definition;
END;
$queue_trigger$;

COMMIT;
