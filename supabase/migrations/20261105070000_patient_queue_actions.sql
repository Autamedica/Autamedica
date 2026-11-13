-- Cancellation and refusal are explicit user actions.
-- No doctors available never cancels the patient's request.
BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_my_pharmacy_dispatch_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $cancel_patient$
DECLARE v_user uuid := auth.uid(); v_req public.pharmacy_dispatch_requests%ROWTYPE;
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

  IF v_req.status <> 'searching' THEN
    RETURN jsonb_build_object('cancelled',false,'code','ALREADY_ASSIGNED_OR_CLOSED');
  END IF;

  UPDATE public.pharmacy_dispatch_requests
  SET status='cancelled', updated_at=NOW()
  WHERE id=p_request_id AND status='searching';

  UPDATE public.dispatch_offers
  SET status='expired'
  WHERE dispatch_request_id=p_request_id AND status='pending';

  RETURN jsonb_build_object('cancelled',true,'code','PATIENT_CANCELLED');
END;
$cancel_patient$;

REVOKE ALL ON FUNCTION public.cancel_my_pharmacy_dispatch_request(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_pharmacy_dispatch_request(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decline_my_pharmacy_dispatch_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO public, pg_temp
AS $decline_offer$
DECLARE v_user uuid := auth.uid(); v_offer public.dispatch_offers%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  SELECT o.* INTO v_offer
  FROM public.dispatch_offers o
  JOIN public.doctors d ON d.id=o.doctor_id
  WHERE o.id=p_offer_id AND d.user_id=v_user AND d.active IS TRUE
  FOR UPDATE OF o;

  IF NOT FOUND OR v_offer.status <> 'pending' OR v_offer.expires_at <= NOW() THEN
    RETURN jsonb_build_object('declined',false,'code','OFFER_NO_LONGER_ACTIVE');
  END IF;

  UPDATE public.dispatch_offers SET status='declined' WHERE id=p_offer_id;

  -- Immediately try the next available doctor in the SAME country.
  BEGIN
    PERFORM public.match_dispatch_doctors(v_offer.dispatch_request_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'decline_dispatch_retry_failed: %', SQLSTATE;
  END;

  RETURN jsonb_build_object('declined',true,'code','OFFER_DECLINED');
END;
$decline_offer$;

REVOKE ALL ON FUNCTION public.decline_my_pharmacy_dispatch_offer(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_my_pharmacy_dispatch_offer(uuid)
  TO authenticated, service_role;

COMMIT;
