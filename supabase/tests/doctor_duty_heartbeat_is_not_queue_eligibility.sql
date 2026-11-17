-- Contract: explicit on-duty membership owns queue visibility, while a clinical
-- offer requires a fresh heartbeat. FCM is push delivery, never availability.
BEGIN;
DO $guard_contract$
DECLARE
  v_capacity text := lower(pg_get_functiondef('public.get_country_on_duty_capacity(text)'::regprocedure));
  v_active text := lower(pg_get_functiondef('public.get_active_on_duty_doctors()'::regprocedure));
  v_matcher text := lower(pg_get_functiondef('app_private.match_dispatch_doctors_without_switch(uuid)'::regprocedure));
  v_trigger text := lower(pg_get_functiondef('app_private.dispatch_waiting_patient_on_doctor_presence()'::regprocedure));
  v_activation text := lower(pg_get_functiondef('public.set_doctor_duty_status(uuid,boolean,public.dispatch_tier_category[])'::regprocedure));
BEGIN
  IF position('last_heartbeat_at' IN v_capacity) > 0
     OR position('fcm_token' IN v_capacity) > 0 THEN
    RAISE EXCEPTION 'Patient capacity must reflect explicit on-duty membership, not reachability';
  END IF;
  IF position('last_heartbeat_at' IN v_active) > 0 THEN
    RAISE EXCEPTION 'Active doctor radar must show explicit guard duty independently of heartbeat';
  END IF;
  IF position('dds.last_heartbeat_at >= now() - interval ''90 seconds''' IN v_matcher) = 0
     OR position('fcm_token' IN v_matcher) > 0 THEN
    RAISE EXCEPTION 'Offer eligibility must require heartbeat <=90 seconds; FCM cannot qualify a doctor';
  END IF;
  IF position('new.last_heartbeat_at' IN v_trigger) > 0
     OR position('fcm_token' IN v_trigger) > 0
     OR position('new.is_on_duty' IN v_trigger) = 0 THEN
    RAISE EXCEPTION 'Queue activation must depend on explicit on-duty membership, not FCM/heartbeat';
  END IF;
  IF position('last_heartbeat_at' IN v_activation) = 0
     OR position('now()' IN v_activation) = 0 THEN
    RAISE EXCEPTION 'Activating guard must stamp an initial heartbeat';
  END IF;
  IF position('is_on_duty' IN v_matcher) = 0
     OR position('is_doctor_dispatch_approved' IN v_matcher) = 0
     OR position('care_country' IN v_matcher) = 0 THEN
    RAISE EXCEPTION 'Clinical approval, explicit guard duty and country isolation must remain enforced';
  END IF;
  IF position('interval ''30 seconds''' IN v_matcher) = 0 THEN
    RAISE EXCEPTION 'Sequential doctor offer must retain its 30 second expiry';
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
END;
$guard_contract$;
ROLLBACK;
