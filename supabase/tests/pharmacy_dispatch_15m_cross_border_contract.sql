-- Contract test for staged pharmacy dispatch and reviewed cross-border routes.
-- Run only on a disposable database after replaying all migrations.
BEGIN;
DO $contract$
DECLARE
  v_matcher text := lower(pg_get_functiondef('app_private.match_dispatch_doctors_without_switch(uuid)'::regprocedure));
  v_claim text := lower(pg_get_functiondef('public.claim_dispatch_offer(uuid)'::regprocedure));
  v_capacity text := lower(pg_get_functiondef('public.get_pharmacy_dispatch_international_capacity(uuid)'::regprocedure));
  v_advance text := lower(pg_get_functiondef('public.advance_pharmacy_dispatch_search(uuid,text)'::regprocedure));
  v_pending text := lower(pg_get_functiondef('public.get_my_pending_dispatch_offers()'::regprocedure));
  v_expiry text := lower(pg_get_functiondef('public.expire_stale_dispatch_requests()'::regprocedure));
  v_payment text := lower(pg_get_functiondef('public.activate_paid_pharmacy_dispatch()'::regprocedure));
  v_call_guard text := lower(pg_get_functiondef('app_private.guard_clinical_care_country()'::regprocedure));
  v_request_guard text := lower(pg_get_functiondef('app_private.guard_dispatch_care_country()'::regprocedure));
  v_telemedicine_guard text := lower(pg_get_functiondef('app_private.guard_telemedicine_care_country()'::regprocedure));
BEGIN
  IF position('interval ''15 minutes''' IN v_expiry)=0
     OR position('interval ''25 seconds''' IN v_expiry)>0 THEN
    RAISE EXCEPTION 'Searching requests must remain active for a full 15-minute stage';
  END IF;
  IF position('interval ''15 minutes''' IN v_payment)=0
     OR position('interval ''25 seconds''' IN v_payment)>0 THEN
    RAISE EXCEPTION 'Payment approval must start a full 15-minute clinical search';
  END IF;
  IF position('last_heartbeat_at' IN v_matcher)>0
     OR position('fcm_token' IN v_matcher)>0 THEN
    RAISE EXCEPTION 'Sequential matcher must not require heartbeat or FCM';
  END IF;
  IF position('interval ''30 seconds''' IN v_matcher)=0 THEN
    RAISE EXCEPTION 'Individual doctor offers must remain 30 seconds';
  END IF;
  IF position('limit 20' IN v_matcher)=0
     OR position('recent.status=''accepted''' IN v_matcher)=0
     OR position('when count(*)=0 then 0::numeric' IN v_matcher)=0 THEN
    RAISE EXCEPTION 'Ranking must use last-20 acceptance rate with neutral score for no history';
  END IF;
  IF position('route.enabled is true' IN v_matcher)=0
     OR position('is_doctor_dispatch_approved_for_country' IN v_matcher)=0
     OR position('international_search_enabled' IN v_matcher)=0 THEN
    RAISE EXCEPTION 'Cross-border candidates must require opt-in, enabled route, and reviewed target-country credential';
  END IF;
  IF position('patient_currency' IN v_matcher)=0
     OR position('doctor_currency' IN v_matcher)=0
     OR position('doctor_fee_minor' IN v_matcher)=0 THEN
    RAISE EXCEPTION 'Cross-border payout currency must be separate from patient quote';
  END IF;
  IF position('local_search_in_progress' IN v_capacity)=0
     OR position('interval ''15 minutes''' IN v_capacity)=0 THEN
    RAISE EXCEPTION 'International option must remain unavailable before the first 15-minute local stage';
  END IF;
  IF position('continue_local' IN v_advance)=0
     OR position('international' IN v_advance)=0
     OR position('doctor_offer_in_progress' IN v_advance)=0 THEN
    RAISE EXCEPTION 'Search transition must support local continuation and only advance after offers close';
  END IF;
  IF position('patient_avatar_url' IN v_pending)=0
     OR position('offer_expires_at' IN v_pending)=0 THEN
    RAISE EXCEPTION 'Authenticated doctor offer must include patient avatar and server expiry';
  END IF;
  IF position('has_valid_pharmacy_dispatch_cross_border' IN v_call_guard)=0
     OR position('is_doctor_dispatch_approved_for_country' IN v_request_guard)=0
     OR position('has_valid_pharmacy_dispatch_cross_border' IN v_telemedicine_guard)=0 THEN
    RAISE EXCEPTION 'Cross-border call and request guards must validate the accepted route';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pharmacy_dispatch_requests'
      AND column_name='doctor_payout_currency'
  ) THEN
    RAISE EXCEPTION 'Doctor payout currency snapshot is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dispatch_offers'
      AND column_name='cross_border_route_id'
  ) THEN
    RAISE EXCEPTION 'Per-offer cross-border route snapshot is required';
  END IF;
END;
$contract$;
ROLLBACK;
