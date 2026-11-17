-- Contract: explicit on-duty status owns queue visibility and offer acceptance.
-- Heartbeat is telemetry/recovery, not a prerequisite for a current physician offer.
-- Each offer stays sequential for 30 seconds; the patient search remains open 15 minutes.
BEGIN;
DO $guard_contract$
DECLARE
  v_capacity text := lower(pg_get_functiondef('public.get_country_on_duty_capacity(text)'::regprocedure));
  v_active text := lower(pg_get_functiondef('public.get_active_on_duty_doctors()'::regprocedure));
  v_matcher text := lower(pg_get_functiondef('app_private.match_dispatch_doctors_without_switch(uuid)'::regprocedure));
  v_trigger text := lower(pg_get_functiondef('app_private.dispatch_waiting_patient_on_doctor_presence()'::regprocedure));
  v_claim text := lower(pg_get_functiondef('public.claim_pharmacy_request_tier(uuid,uuid)'::regprocedure));
  v_activation text := lower(pg_get_functiondef('public.activate_paid_pharmacy_dispatch()'::regprocedure));
  v_expiry text := lower(pg_get_functiondef('public.expire_stale_dispatch_requests()'::regprocedure));
  v_cancel text := lower(pg_get_functiondef('public.cancel_my_pharmacy_dispatch_request(uuid)'::regprocedure));
BEGIN
  IF position('last_heartbeat_at' IN v_capacity) > 0
     OR position('fcm_token' IN v_capacity) > 0 THEN
    RAISE EXCEPTION 'Patient capacity must reflect active guard duty, not heartbeat freshness or FCM registration';
  END IF;
  IF position('last_heartbeat_at' IN v_active) > 0 THEN
    RAISE EXCEPTION 'Active doctor radar must show explicit guard duty independently of heartbeat';
  END IF;
  IF position('last_heartbeat_at' IN v_matcher) > 0
     OR position('fcm_token' IN v_matcher) > 0 THEN
    RAISE EXCEPTION 'Offer eligibility must not depend on heartbeat freshness or FCM token';
  END IF;
  IF position('new.last_heartbeat_at' IN v_trigger) > 0 THEN
    RAISE EXCEPTION 'Queue activation must not depend on a heartbeat update';
  END IF;
  IF position('is_on_duty' IN v_matcher) = 0
     OR position('is_doctor_dispatch_approved' IN v_matcher) = 0
     OR position('care_country' IN v_matcher) = 0
     OR position('license_number' IN v_matcher) = 0 THEN
    RAISE EXCEPTION 'Matcher must retain active duty, approval, country and licence checks';
  END IF;
  IF position('last_heartbeat_at' IN v_claim) > 0 THEN
    RAISE EXCEPTION 'A current, doctor-specific offer must not be rejected for a stale heartbeat';
  END IF;
  IF position('is_on_duty' IN v_claim) = 0
     OR position('is_doctor_dispatch_approved' IN v_claim) = 0
     OR position('care_country' IN v_claim) = 0
     OR position('license_number' IN v_claim) = 0
     OR position('valid_offer_required' IN v_claim) = 0
     OR position('current_active_request_id' IN v_claim) = 0 THEN
    RAISE EXCEPTION 'Offer acceptance lost duty, approval, country, licence, offer or busy-state checks';
  END IF;
  IF position('interval ''30 seconds''' IN v_matcher) = 0 THEN
    RAISE EXCEPTION 'Sequential doctor offer must retain its 30-second expiry';
  END IF;
  IF position('recent.status=''accepted''' IN v_matcher) = 0
     OR position('limit 20' IN v_matcher) = 0 THEN
    RAISE EXCEPTION 'Doctor selection must prioritize acceptance rate over the last 20 offers';
  END IF;
  IF position('when count(*) = 0 then 0::numeric' IN v_matcher) = 0 THEN
    RAISE EXCEPTION 'Doctors without history must not receive an artificial 100 percent acceptance rate';
  END IF;
  IF position('max(recent.offered_at)' IN v_matcher) = 0 THEN
    RAISE EXCEPTION 'Ties must prioritize the doctor waiting longest since their last offer';
  END IF;
  IF position('interval ''15 minutes''' IN v_activation) = 0 THEN
    RAISE EXCEPTION 'Approved payment must start a full 15-minute local search window';
  END IF;
  IF position('interval ''15 minutes''' IN v_expiry) = 0
     OR position('interval ''25 seconds''' IN v_expiry) > 0 THEN
    RAISE EXCEPTION 'Search expiry must use the same 15-minute window as payment activation';
  END IF;
  IF position('wait_window_not_reached' IN v_cancel) = 0
     OR position('interval ''15 minutes''' IN v_cancel) = 0
     OR position('status in (''searching'',''expired'')' IN v_cancel) = 0 THEN
    RAISE EXCEPTION 'Patient cancellation must unlock only after 15 minutes for an unassigned request';
  END IF;
END;
$guard_contract$;
ROLLBACK;
