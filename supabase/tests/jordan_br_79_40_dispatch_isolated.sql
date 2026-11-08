-- Isolated local Supabase only. Never run on production or with real patients.
-- Execute after the Jordan tariff migration; all synthetic data is rolled back.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('autamedica.isolated_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'jordan_79_40_smoke_requires_isolated_test';
  END IF;
END $guard$;

-- Avoid any push or external side effect during synthetic offers.
CREATE OR REPLACE FUNCTION app_private.send_authenticated_dispatch_push(
  p_user_id uuid, p_title text, p_body text, p_data jsonb
) RETURNS bigint LANGUAGE sql SECURITY DEFINER
SET search_path TO '' AS $mock_push$ SELECT 1::bigint $mock_push$;

DO $test$
DECLARE
  v_jordan uuid;
  v_br uuid;
  v_ar uuid;
  v_partner uuid;
  v_doc uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_offer numeric;
  v_claim jsonb;
BEGIN
  SELECT id INTO STRICT v_partner FROM public.commercial_referral_partners
  WHERE code='JORDAN' AND active IS TRUE;

  INSERT INTO public.pharmacy_dispatch_requests(
      patient_phone,patient_cpf,patient_name,tier_requested,care_country,
      cloudflare_room_id,status,referral_partner_id
  ) VALUES (
      '5551900000101','12345678909','SYNTHETIC JORDAN ONLY','general','BR',
      'ci-jordan-br-'||gen_random_uuid()::text,'searching',v_partner
  ) RETURNING id INTO v_jordan;

  IF NOT EXISTS(
    SELECT 1 FROM public.pharmacy_dispatch_requests
    WHERE id=v_jordan AND price_brl=79.00 AND doctor_fee_brl=40.00
  ) THEN RAISE EXCEPTION 'Jordan must persist the independent 79/40 quote'; END IF;

  INSERT INTO public.pharmacy_dispatch_requests(
      patient_phone,patient_cpf,patient_name,tier_requested,care_country,
      cloudflare_room_id,status
  ) VALUES (
      '5551900000102','12345678909','SYNTHETIC BR OTHER','general','BR',
      'ci-other-br-'||gen_random_uuid()::text,'searching'
  ) RETURNING id INTO v_br;

  IF EXISTS(
    SELECT 1 FROM public.pharmacy_dispatch_requests
    WHERE id=v_br AND (price_brl=79.00 OR doctor_fee_brl=40.00)
  ) THEN RAISE EXCEPTION 'Jordan pricing leaked into ordinary BR'; END IF;

  INSERT INTO public.pharmacy_dispatch_requests(
      patient_phone,patient_dni,patient_name,tier_requested,care_country,
      cloudflare_room_id,status
  ) VALUES (
      '5491100000103','38123456','SYNTHETIC AR OTHER','general','AR',
      'ci-other-ar-'||gen_random_uuid()::text,'searching'
  ) RETURNING id INTO v_ar;

  INSERT INTO auth.users(id,email)
  VALUES(v_user,'jordan-tariff-ci-'||v_user||'@example.invalid');
  INSERT INTO public.doctors(id,user_id,license_type,license_number,uf_brazil,specialty,active)
  VALUES(v_doc,v_user,'CRM','CI-'||v_doc::text,'RS','Medicina General',true);
  INSERT INTO public.doctor_licenses(
    doctor_id,license_type,license_number,uf_brazil,status,cfm_validation_status
  ) VALUES(v_doc,'CRM','CI-'||v_doc::text,'RS','active','valid');

  IF NOT app_private.is_doctor_dispatch_approved(v_doc) THEN
    RAISE EXCEPTION 'Synthetic BR doctor must be CRM-approved';
  END IF;
  INSERT INTO public.doctor_duty_status(
    doctor_id,is_on_duty,last_heartbeat_at,duty_started_at
  ) VALUES(v_doc,true,now(),now());

  SELECT o.price_brl INTO v_offer FROM public.dispatch_offers o
  WHERE o.dispatch_request_id=v_jordan AND o.doctor_id=v_doc AND o.status='pending';
  IF v_offer IS DISTINCT FROM 40.00 THEN
    RAISE EXCEPTION 'Jordan must offer exactly R$40, found %', v_offer;
  END IF;

  IF EXISTS(SELECT 1 FROM public.dispatch_offers
            WHERE dispatch_request_id=v_ar AND doctor_id=v_doc)
  THEN RAISE EXCEPTION 'BR doctor offered an AR consultation'; END IF;

  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT public.claim_pharmacy_request_tier(v_doc,v_jordan) INTO v_claim;
  IF COALESCE(v_claim->>'success','false') <> 'true' OR NOT EXISTS(
    SELECT 1 FROM public.dispatch_offers
    WHERE dispatch_request_id=v_jordan AND doctor_id=v_doc
      AND status='accepted' AND price_brl=40.00
  ) OR NOT EXISTS(
    SELECT 1 FROM public.pharmacy_dispatch_requests
    WHERE id=v_jordan AND status='matched'
      AND price_brl=79.00 AND doctor_fee_brl=40.00
  ) THEN RAISE EXCEPTION 'Doctor acceptance lost exact Jordan quote: %', v_claim; END IF;
END $test$;

ROLLBACK;
SELECT 'PASS: Jordan BR 79/40; ordinary BR/AR isolated' AS smoke_result;
