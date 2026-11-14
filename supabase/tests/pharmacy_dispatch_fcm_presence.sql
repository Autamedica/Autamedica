-- Contract test for FCM-backed guard presence. Disposable local Supabase only.
BEGIN;
DO $presence$
DECLARE
  v_matcher text;
  v_private_matcher text;
  v_capacity text;
  v_trigger text;
  v_activation text;
BEGIN
  SELECT lower(pg_get_functiondef('public.match_dispatch_doctors(uuid)'::regprocedure)) INTO v_matcher;
  SELECT lower(pg_get_functiondef('app_private.match_dispatch_doctors_without_switch(uuid)'::regprocedure)) INTO v_private_matcher;
  SELECT lower(pg_get_functiondef('public.get_country_on_duty_capacity(text)'::regprocedure)) INTO v_capacity;
  SELECT lower(pg_get_functiondef('app_private.dispatch_waiting_patient_on_doctor_presence()'::regprocedure)) INTO v_trigger;
  SELECT lower(pg_get_functiondef('public.set_doctor_duty_status(uuid,boolean,public.dispatch_tier_category[])'::regprocedure)) INTO v_activation;

  IF position('brazil_payment_required' IN v_matcher)=0
     OR position('match_dispatch_doctors_without_switch' IN v_matcher)=0 THEN
    RAISE EXCEPTION 'Public matcher must enforce paid BR checkout before delegating';
  END IF;
  IF position('fcm_token' IN v_private_matcher)=0
     OR position('last_heartbeat_at' IN v_private_matcher)=0
     OR position('dds.is_on_duty' IN v_private_matcher)=0
     OR position('or exists (' IN v_private_matcher)=0 THEN
    RAISE EXCEPTION 'Private matcher must require active guard and (fresh heartbeat OR registered FCM)';
  END IF;
  IF position('fcm_token' IN v_capacity)=0
     OR position('s.is_on_duty' IN v_capacity)=0 THEN
    RAISE EXCEPTION 'Country capacity does not include FCM-reachable on-duty doctors';
  END IF;
  IF position('fcm_token' IN v_trigger)=0
     OR position('new.is_on_duty' IN v_trigger)=0 THEN
    RAISE EXCEPTION 'Waiting queue presence trigger cannot recover via FCM';
  END IF;
  IF position('last_heartbeat_at' IN v_activation)=0
     OR position('now()' IN v_activation)=0 THEN
    RAISE EXCEPTION 'Activating guard does not stamp initial heartbeat';
  END IF;
END;
$presence$;
ROLLBACK;
