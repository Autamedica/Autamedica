-- Keep explicit on-duty membership independent of reachability while allowing
-- a physician to accept a current offer without a stale telemetry heartbeat.
-- Every patient search gets a 15-minute local-market window; each offer still
-- rotates independently after 30 seconds.
BEGIN;

DO $claim_acceptance$
DECLARE
  v_definition text;
  v_old text := $old$      AND is_on_duty = true
      AND last_heartbeat_at > NOW() - INTERVAL '90 seconds'
$old$;
  v_new text := $new$      AND is_on_duty = true
$new$;
BEGIN
  SELECT pg_get_functiondef('public.claim_pharmacy_request_tier(uuid,uuid)'::regprocedure)
    INTO v_definition;

  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, v_new);
  ELSIF position('last_heartbeat_at' IN lower(v_definition)) > 0 THEN
    RAISE EXCEPTION 'Unexpected claim heartbeat predicate; refusing unsafe migration';
  ELSIF position('AND is_on_duty = true' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Claim function lost its explicit on-duty guard; refusing migration';
  END IF;

  IF position('app_private.is_doctor_dispatch_approved' IN v_definition) = 0
     OR position('VALID_OFFER_REQUIRED' IN v_definition) = 0
     OR position('care_country' IN v_definition) = 0
     OR position('license_number' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Claim function is missing clinical, country, licence or offer checks';
  END IF;

  EXECUTE v_definition;
END;
$claim_acceptance$;

DO $activate_paid_search$
DECLARE
  v_definition text;
  v_old text := $old$search_timeout_at = now() + interval '25 seconds'$old$;
  v_new text := $new$search_timeout_at = now() + interval '15 minutes'$new$;
BEGIN
  SELECT pg_get_functiondef('public.activate_paid_pharmacy_dispatch()'::regprocedure)
    INTO v_definition;

  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, v_new);
  ELSIF position('search_timeout_at = now() + interval ''15 minutes''' IN lower(v_definition)) = 0 THEN
    RAISE EXCEPTION 'Unexpected paid-dispatch activation timeout; refusing migration';
  END IF;

  IF position('search_timeout_at = now() + interval ''15 minutes''' IN lower(v_definition)) = 0 THEN
    RAISE EXCEPTION 'Paid-dispatch activation does not preserve the 15-minute window';
  END IF;
  EXECUTE v_definition;
END;
$activate_paid_search$;

DO $expire_search_window$
DECLARE
  v_definition text;
  v_old text := $old$COALESCE(req.search_started_at, req.created_at) + interval '25 seconds'$old$;
  v_new text := $new$COALESCE(req.search_started_at, req.created_at) + interval '15 minutes'$new$;
BEGIN
  SELECT pg_get_functiondef('public.expire_stale_dispatch_requests()'::regprocedure)
    INTO v_definition;

  IF position(v_old IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old, v_new);
  ELSIF position('COALESCE(req.search_started_at, req.created_at) + interval ''15 minutes''' IN lower(v_definition)) = 0 THEN
    RAISE EXCEPTION 'Unexpected dispatch expiry timeout; refusing migration';
  END IF;

  IF position('COALESCE(req.search_started_at, req.created_at) + interval ''15 minutes''' IN lower(v_definition)) = 0 THEN
    RAISE EXCEPTION 'Dispatch expiry does not preserve the 15-minute window';
  END IF;
  EXECUTE v_definition;
END;
$expire_search_window$;

CREATE OR REPLACE FUNCTION public.cancel_my_pharmacy_dispatch_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id=p_request_id AND requested_by_user_id=v_user
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('cancelled',false,'code','NOT_OWN_REQUEST');
  END IF;

  IF v_req.status NOT IN ('searching','expired') THEN
    RETURN jsonb_build_object('cancelled',false,'code','ALREADY_ASSIGNED_OR_CLOSED');
  END IF;

  IF COALESCE(v_req.search_started_at, v_req.created_at) + interval '15 minutes' > now() THEN
    RETURN jsonb_build_object('cancelled',false,'code','WAIT_WINDOW_NOT_REACHED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers offer
    WHERE offer.dispatch_request_id=p_request_id
      AND offer.status='pending'
      AND offer.expires_at>now()
  ) THEN
    RETURN jsonb_build_object('cancelled',false,'code','DOCTOR_OFFER_STILL_ACTIVE');
  END IF;

  UPDATE public.pharmacy_dispatch_requests
  SET status='cancelled', updated_at=NOW()
  WHERE id=p_request_id AND status IN ('searching','expired');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('cancelled',false,'code','ALREADY_ASSIGNED_OR_CLOSED');
  END IF;

  UPDATE public.dispatch_offers
  SET status='expired'
  WHERE dispatch_request_id=p_request_id AND status='pending';

  RETURN jsonb_build_object('cancelled',true,'code','PATIENT_CANCELLED');
END;
$function$;

COMMIT;
