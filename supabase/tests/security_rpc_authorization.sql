-- Regression tests for cross-user / cross-country authorization on SECURITY DEFINER RPCs.
-- Run in a transaction: all writes are expected to be rejected and rolled back.
BEGIN;
DO $security_tests$
DECLARE
  denied boolean;
  n integer;
  summary jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);

  denied:=false;
  BEGIN
    PERFORM * FROM public.replace_weekly_availability(
      '00000000-0000-0000-0000-000000000002'::uuid,'[]'::jsonb);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'replace_weekly_availability accepted another doctor'; END IF;

  denied:=false;
  BEGIN
    PERFORM public.set_doctor_duty_status(
      '00000000-0000-0000-0000-000000000002'::uuid,false,
      ARRAY['general']::public.dispatch_tier_category[]);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'set_doctor_duty_status accepted another doctor'; END IF;

  denied:=false;
  BEGIN
    PERFORM public.claim_pharmacy_request_tier(
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'claim_pharmacy_request_tier accepted another doctor'; END IF;

  denied:=false;
  BEGIN
    PERFORM * FROM public.patient_wallet_get_balance('00000000-0000-0000-0000-000000000003'::uuid);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'patient_wallet_get_balance exposed another patient'; END IF;

  denied:=false;
  BEGIN
    PERFORM * FROM public.patient_health_reserve_get_balance('00000000-0000-0000-0000-000000000003'::uuid);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'patient_health_reserve_get_balance exposed another patient'; END IF;

  denied:=false;
  BEGIN
    PERFORM public.add_to_care_team(
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid,'primary',NULL);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'add_to_care_team accepted another doctor'; END IF;

  denied:=false;
  BEGIN
    PERFORM public.remove_from_care_team(
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid,NULL);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'remove_from_care_team accepted another doctor'; END IF;

  denied:=false;
  BEGIN
    PERFORM public.take_triage_case('00000000-0000-0000-0000-000000000004'::uuid);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'take_triage_case accepted an unapproved doctor'; END IF;

  IF public.has_active_authorization(
      '00000000-0000-0000-0000-000000000004'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'has_active_authorization exposed another user';
  END IF;

  IF public.community_group_allowed_for_patient(
      '00000000-0000-0000-0000-000000000003'::uuid,
      '00000000-0000-0000-0000-000000000004'::uuid) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'community_group_allowed_for_patient exposed another patient';
  END IF;

  IF public.doctor_can_chat_with_patient(
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'doctor_can_chat_with_patient exposed another relationship';
  END IF;

  IF public.is_in_care_team(
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'is_in_care_team exposed another relationship';
  END IF;

  SELECT count(*) INTO n FROM public.get_doctor_busy_slots(
    '00000000-0000-0000-0000-000000000002'::uuid,current_date,current_date);
  IF n<>0 THEN RAISE EXCEPTION 'get_doctor_busy_slots exposed another doctor'; END IF;

  SELECT public.get_duty_doctors_summary() INTO summary;
  IF summary IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'get_duty_doctors_summary exposed another country: %',summary;
  END IF;
END
$security_tests$;
ROLLBACK;
