-- Keep explicit guard-duty membership independent of reachability, but never send
-- a clinical dispatch offer to a doctor without a heartbeat from the last 90s.
-- FCM remains a delivery channel only; it is not an availability signal.
-- This migration intentionally follows 20261117190000_duty_queue_independent_of_heartbeat.
DO $heartbeat_guard$
DECLARE
  v_definition text;
  v_anchor text := $anchor$    AND dds.is_on_duty=true$anchor$;
  v_guard text := $guard$    AND dds.last_heartbeat_at >= now() - interval '90 seconds'
    AND dds.last_heartbeat_at <= now()$guard$;
BEGIN
  SELECT pg_get_functiondef(
    'app_private.match_dispatch_doctors_without_switch(uuid)'::regprocedure
  ) INTO v_definition;

  IF position(v_guard IN v_definition) > 0 THEN
    IF position('fcm_token' IN lower(v_definition)) > 0 THEN
      RAISE EXCEPTION 'Heartbeat guard exists but an FCM availability fallback remains';
    END IF;
    RETURN;
  END IF;

  IF position(v_anchor IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected dispatch matcher definition; refusing unsafe heartbeat migration';
  END IF;

  IF position('fcm_token' IN lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Unexpected FCM predicate in dispatch matcher; refusing unsafe migration';
  END IF;

  v_definition := replace(v_definition, v_anchor, v_anchor || E'\n' || v_guard);
  EXECUTE v_definition;
END;
$heartbeat_guard$;
