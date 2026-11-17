-- Contract: explicit on-duty status owns the offer queue; heartbeat is
-- telemetry/recovery, not a prerequisite for a sequential 30s offer.
BEGIN;
DO $guard_contract$
DECLARE
  v_capacity text := pg_get_functiondef('public.get_country_on_duty_capacity(text)'::regprocedure);
  v_active text := pg_get_functiondef('public.get_active_on_duty_doctors()'::regprocedure);
  v_matcher text := pg_get_functiondef('app_private.match_dispatch_doctors_without_switch(uuid)'::regprocedure);
  v_trigger text := pg_get_functiondef('app_private.dispatch_waiting_patient_on_doctor_presence()'::regprocedure);
BEGIN
  IF position('last_heartbeat_at' IN lower(v_capacity)) > 0 THEN
    RAISE EXCEPTION 'Patient capacity must not hide an active guard because heartbeat is stale';
  END IF;
  IF position('last_heartbeat_at' IN lower(v_active)) > 0 THEN
    RAISE EXCEPTION 'Active doctor radar must show explicit guard duty independently of heartbeat';
  END IF;
  IF position('last_heartbeat_at' IN lower(v_matcher)) > 0
     OR position('fcm_token' IN lower(v_matcher)) > 0 THEN
    RAISE EXCEPTION 'Offer eligibility must not depend on heartbeat freshness or FCM token';
  END IF;
  IF position('new.last_heartbeat_at' IN lower(v_trigger)) > 0 THEN
    RAISE EXCEPTION 'Queue retry trigger must not require a fresh heartbeat';
  END IF;
  IF position('is_on_duty' IN lower(v_matcher)) = 0
     OR position('is_doctor_dispatch_approved' IN lower(v_matcher)) = 0
     OR position('care_country' IN lower(v_matcher)) = 0 THEN
    RAISE EXCEPTION 'Clinical approval, explicit guard duty and country isolation must remain enforced';
  END IF;
  IF position('interval ''30 seconds''' IN lower(v_matcher)) = 0 THEN
    RAISE EXCEPTION 'Sequential doctor offer must retain its 30 second expiry';
  END IF;
  IF position('recent.status=''accepted''' IN lower(v_matcher)) = 0
     OR position('limit 20' IN lower(v_matcher)) = 0 THEN
    RAISE EXCEPTION 'Doctor selection must prioritize acceptance rate over the last 20 offers';
  END IF;
  IF position('max(recent.offered_at)' IN lower(v_matcher)) = 0 THEN
    RAISE EXCEPTION 'Ties must prioritize the doctor waiting longest since their last offer';
  END IF;
END;
$guard_contract$;
ROLLBACK;
