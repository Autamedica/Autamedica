-- Isolated local Supabase only. Synthetic profiles, requests and offers roll back.
-- Run after the Jordan tariff migration and 20261109150000_jordan_generalist_only_dispatch.sql.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('autamedica.isolated_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'jordan_general_service_test_requires_isolated_test';
  END IF;
END $guard$;

-- No external push may be emitted by a synthetic dispatch test.
CREATE OR REPLACE FUNCTION app_private.send_authenticated_dispatch_push(
  p_user_id uuid, p_title text, p_body text, p_data jsonb
) RETURNS bigint LANGUAGE sql SECURITY DEFINER
SET search_path TO '' AS $mock_push$ SELECT 1::bigint $mock_push$;

DO $test$
DECLARE
  v_psychiatrist uuid := gen_random_uuid();
  v_cardiologist uuid := gen_random_uuid();
  v_generalist uuid := gen_random_uuid();
  v_ar_general uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_request_specialist uuid;
  v_request_generalist uuid;
  v_partner uuid;
  v_user uuid;
  v_offer_count integer;
  v_offer_doctor uuid;
  v_offer_price numeric;
BEGIN
  SELECT id INTO STRICT v_partner
  FROM public.commercial_referral_partners
  WHERE code='JORDAN' AND active IS TRUE;

  -- Two Jordan general consultations enter the queue before any doctor is on duty.
  INSERT INTO public.pharmacy_dispatch_requests(
    patient_phone,patient_cpf,patient_name,tier_requested,care_country,
    cloudflare_room_id,status,referral_partner_id
  ) VALUES (
    '5551900000101','12345678909','SYNTHETIC JORDAN SPECIALIST','general','BR',
    'ci-jordan-specialist-'||gen_random_uuid()::text,'searching',v_partner
  ) RETURNING id INTO v_request_specialist;

  INSERT INTO public.pharmacy_dispatch_requests(
    patient_phone,patient_cpf,patient_name,tier_requested,care_country,
    cloudflare_room_id,status,referral_partner_id
  ) VALUES (
    '5551900000102','12345678909','SYNTHETIC JORDAN GENERALIST','general','BR',
    'ci-jordan-generalist-'||gen_random_uuid()::text,'searching',v_partner
  ) RETURNING id INTO v_request_generalist;

  IF (SELECT count(*) FROM public.pharmacy_dispatch_requests
      WHERE id IN (v_request_specialist,v_request_generalist)
        AND price_brl=79.00 AND doctor_fee_brl=40.00) <> 2 THEN
    RAISE EXCEPTION 'Jordan must persist exact R$79/R$40 quotes';
  END IF;

  -- Create synthetic verified medical profiles.
  FOR v_user IN SELECT unnest(ARRAY[
    v_psychiatrist,v_cardiologist,v_generalist,v_ar_general
  ])
  LOOP
    INSERT INTO auth.users(id,email)
    VALUES(v_user,'jordan-general-service-test-'||v_user||'@example.invalid');
  END LOOP;
  INSERT INTO auth.users(id,email)
  VALUES(v_reviewer,'jordan-general-cfm-reviewer-ci-'||v_reviewer||'@example.invalid');
  UPDATE public.profiles SET role='admin',active=true WHERE user_id=v_reviewer;

  INSERT INTO public.doctors(
    id,user_id,license_type,license_number,uf_brazil,specialty,active,care_country
  ) VALUES
    (v_psychiatrist,v_psychiatrist,'CRM','CI-'||v_psychiatrist::text,'RS','Psiquiatria',true,'BR'),
    (v_cardiologist,v_cardiologist,'CRM','CI-'||v_cardiologist::text,'RS','Cardiologia',true,'BR'),
    (v_generalist,v_generalist,'CRM','CI-'||v_generalist::text,'RS','Clínica Geral',true,'BR'),
    (v_ar_general,v_ar_general,'MN','CI-'||v_ar_general::text,NULL,'Clínica Geral',true,'AR');

  INSERT INTO public.doctor_licenses(
    doctor_id,license_type,license_number,uf_brazil,status,cfm_validation_status,
    cfm_evidence_path,cfm_review_notes,cfm_reviewed_by,cfm_reviewed_at,cfm_last_checked_at
  ) VALUES
    (v_psychiatrist,'CRM','CI-'||v_psychiatrist::text,'RS','active','valid',
      'ci/'||v_psychiatrist::text||'/synthetic-cfm-evidence.pdf',
      'Synthetic manually reviewed CFM credential for isolated test',v_reviewer,now(),now()),
    (v_cardiologist,'CRM','CI-'||v_cardiologist::text,'RS','active','valid',
      'ci/'||v_cardiologist::text||'/synthetic-cfm-evidence.pdf',
      'Synthetic manually reviewed CFM credential for isolated test',v_reviewer,now(),now()),
    (v_generalist,'CRM','CI-'||v_generalist::text,'RS','active','valid',
      'ci/'||v_generalist::text||'/synthetic-cfm-evidence.pdf',
      'Synthetic manually reviewed CFM credential for isolated test',v_reviewer,now(),now()),
    (v_ar_general,'MN','CI-'||v_ar_general::text,NULL,'active','pending',
      NULL,NULL,NULL,NULL,NULL);

  IF NOT app_private.is_jordan_br_eligible_doctor(v_psychiatrist)
     OR NOT app_private.is_jordan_br_eligible_doctor(v_cardiologist)
     OR NOT app_private.is_jordan_br_eligible_doctor(v_generalist) THEN
    RAISE EXCEPTION 'Approved BR physician must be medically eligible irrespective of specialty';
  END IF;

  IF app_private.is_jordan_br_eligible_doctor(v_ar_general) THEN
    RAISE EXCEPTION 'Non-BR physician cannot be eligible for Jordan';
  END IF;

  -- Specialist opts into cardiology only: must NOT receive a general consultation.
  INSERT INTO public.doctor_duty_status(
    doctor_id,is_on_duty,last_heartbeat_at,duty_started_at,active_tiers
  ) VALUES (
    v_cardiologist,true,now(),now()-interval '2 hours',
    ARRAY['cardiologia']::public.dispatch_tier_category[]
  );

  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers
    WHERE dispatch_request_id IN (v_request_specialist,v_request_generalist)
      AND doctor_id=v_cardiologist
  ) THEN
    RAISE EXCEPTION 'Doctor who opted out of general tier received a Jordan offer';
  END IF;

  -- Psychiatrist opts into general: specialty must NOT disqualify the physician.
  INSERT INTO public.doctor_duty_status(
    doctor_id,is_on_duty,last_heartbeat_at,duty_started_at,active_tiers
  ) VALUES (
    v_psychiatrist,true,now(),now()-interval '1 hour',
    ARRAY['general']::public.dispatch_tier_category[]
  );

  SELECT count(*), (array_agg(doctor_id))[1], (array_agg(price_brl))[1]
    INTO v_offer_count,v_offer_doctor,v_offer_price
  FROM public.dispatch_offers
  WHERE dispatch_request_id=v_request_specialist AND status='pending';

  IF v_offer_count<>1 OR v_offer_doctor IS DISTINCT FROM v_psychiatrist
     OR v_offer_price IS DISTINCT FROM 40.00 THEN
    RAISE EXCEPTION 'Jordan must offer R$40 to psychiatrist opted into general; count %, doctor %, price %',
      v_offer_count,v_offer_doctor,v_offer_price;
  END IF;

  -- Generalist also receives the second general consultation.
  INSERT INTO public.doctor_duty_status(
    doctor_id,is_on_duty,last_heartbeat_at,duty_started_at,active_tiers
  ) VALUES (
    v_generalist,true,now(),now(),
    ARRAY['general']::public.dispatch_tier_category[]
  );

  SELECT count(*), (array_agg(doctor_id))[1], (array_agg(price_brl))[1]
    INTO v_offer_count,v_offer_doctor,v_offer_price
  FROM public.dispatch_offers
  WHERE dispatch_request_id=v_request_generalist AND status='pending';

  IF v_offer_count<>1 OR v_offer_doctor IS DISTINCT FROM v_generalist
     OR v_offer_price IS DISTINCT FROM 40.00 THEN
    RAISE EXCEPTION 'Jordan must offer R$40 to the available generalist; count %, doctor %, price %',
      v_offer_count,v_offer_doctor,v_offer_price;
  END IF;

  -- Direct/stale assignment still cannot bypass the doctor's configured duty tiers.
  BEGIN
    UPDATE public.pharmacy_dispatch_requests
    SET assigned_doctor_id=v_cardiologist,status='matched'
    WHERE id=v_request_generalist;
    RAISE EXCEPTION 'Jordan specialist without general tier unexpectedly assigned';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM <> 'jordan_general_service_not_enabled_or_doctor_ineligible' THEN
      RAISE;
    END IF;
  END;

  IF EXISTS (
    SELECT 1 FROM public.pharmacy_dispatch_requests
    WHERE id=v_request_generalist
      AND (status='matched' OR assigned_doctor_id=v_cardiologist)
  ) THEN
    RAISE EXCEPTION 'Rejected assignment modified the Jordan request';
  END IF;

  -- A Brazil general consultation can never be routed to an Argentina doctor.
  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers
    WHERE dispatch_request_id IN (v_request_specialist,v_request_generalist)
      AND doctor_id=v_ar_general
  ) THEN
    RAISE EXCEPTION 'Jordan dispatch crossed country boundary';
  END IF;
END
$test$;

ROLLBACK;
SELECT 'PASS: Jordan routes general consultations to approved BR doctors who opted into general, including specialists' AS smoke_result;
