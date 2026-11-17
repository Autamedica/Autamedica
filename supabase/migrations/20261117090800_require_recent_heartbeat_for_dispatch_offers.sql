-- A registered FCM token proves only that a device can receive a push.
-- It does not prove that the doctor is currently online and able to accept work.
-- Keep dispatch offers strictly gated by a heartbeat no older than 90 seconds.
DO $heartbeat_guard$
DECLARE
  v_definition text;
  v_old text := $old$    AND (
      dds.last_heartbeat_at>now()-interval '90 seconds'
      OR EXISTS (
        SELECT 1 FROM public.profiles fcm
        WHERE fcm.user_id=d.user_id AND NULLIF(btrim(fcm.fcm_token),'') IS NOT NULL
      )
    )$old$;
  v_new text := $new$    AND dds.last_heartbeat_at >= now() - interval '90 seconds'$new$;
BEGIN
  SELECT pg_get_functiondef(
    'app_private.match_dispatch_doctors_without_switch(uuid)'::regprocedure
  ) INTO v_definition;

  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, v_new);
    EXECUTE v_definition;
  ELSIF position(v_new IN v_definition) = 0
     OR position('fcm_token' IN lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Unexpected dispatch matcher heartbeat guard; refusing unsafe migration';
  END IF;
END;
$heartbeat_guard$;
