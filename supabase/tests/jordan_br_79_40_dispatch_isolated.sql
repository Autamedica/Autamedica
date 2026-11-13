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
  v_jordan_unpaid_probe uuid;
  v_br uuid;
  v_ar uuid;
  v_partner uuid;
  v_doc uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_offer numeric;
  v_payment uuid;
  v_claim jsonb;
  v_error text;
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

  -- Separate unpaid request lets this fixture probe the matcher-level gate
  -- without retaining a row lock on the request whose PSP approval trigger
  -- must later dispatch the real synthetic offer.
  INSERT INTO public.pharmacy_dispatch_requests(
      patient_phone,patient_cpf,patient_name,tier_requested,care_country,
      cloudflare_room_id,status,referral_partner_id
  ) VALUES (
      '5551900000199','12345678909','SYNTHETIC JORDAN UNPAID PROBE','general','BR',
      'ci-jordan-unpaid-probe-'||gen_random_uuid()::text,'searching',v_partner
  ) RETURNING id INTO v_jordan_unpaid_probe;

  IF NOT EXISTS(
    SELECT 1 FROM public.pharmacy_dispatch_requests
    WHERE id=v_jordan AND price_brl=79.00 AND doctor_fee_brl=40.00
  ) THEN RAISE EXCEPTION 'Jordan must persist the independent 79/40 quote'; END IF;

  -- Direct SQL insert must not bypass BR-only, general-only or tariff rules.
  BEGIN
    INSERT INTO public.pharmacy_dispatch_requests(
      patient_phone,patient_dni,tier_requested,care_country,
      cloudflare_room_id,status,referral_partner_id
    ) VALUES ('5491100000100','38123456','general','AR',
      'ci-jordan-bad-ar-'||gen_random_uuid(),'searching',v_partner);
    RAISE EXCEPTION 'AR Jordan incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
    IF v_error<>'jordan_br_general_only' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.pharmacy_dispatch_requests(
      patient_phone,patient_cpf,tier_requested,care_country,
      cloudflare_room_id,status,referral_partner_id
    ) VALUES ('5551900000100','12345678909','cardiologia','BR',
      'ci-jordan-bad-specialty-'||gen_random_uuid(),'searching',v_partner);
    RAISE EXCEPTION 'Specialist Jordan incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
    IF v_error<>'jordan_br_general_only' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO public.pharmacy_dispatch_requests(
      patient_phone,patient_cpf,tier_requested,care_country,
      cloudflare_room_id,status,referral_partner_id,price_brl,doctor_fee_brl
    ) VALUES ('5551900000100','12345678909','general','BR',
      'ci-jordan-bad-price-'||gen_random_uuid(),'searching',v_partner,79.00,50.00);
    RAISE EXCEPTION 'Wrong Jordan doctor fee incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
    IF v_error<>'jordan_existing_price_conflict' THEN RAISE; END IF;
  END;

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
  INSERT INTO auth.users(id,email)
  VALUES(v_reviewer,'jordan-cfm-reviewer-ci-'||v_reviewer||'@example.invalid');
  -- Dispatch guard requires an active doctor profile, independently from
  -- CRM validation and the administrator who grants service-tier access.
  UPDATE public.profiles SET role='doctor',active=true WHERE user_id=v_user;
  UPDATE public.profiles SET role='admin',active=true WHERE user_id=v_reviewer;
  -- care_country is generated from the persisted CRM jurisdiction and UF.
  -- Do not write the generated column in an isolated fixture.
  INSERT INTO public.doctors(
    id,user_id,license_type,license_number,uf_brazil,specialty,active
  ) VALUES (
    v_doc,v_user,'CRM','CI-'||v_doc::text,'RS','Medicina General',true
  )
  ON CONFLICT (user_id) DO UPDATE SET
    license_type=EXCLUDED.license_type,
    license_number=EXCLUDED.license_number,
    uf_brazil=EXCLUDED.uf_brazil,
    specialty=EXCLUDED.specialty,
    active=EXCLUDED.active
  RETURNING id INTO v_doc;
  -- Active tiers live in doctor_duty_status.active_tiers in the current
  -- dispatch schema. The isolated fixture sets that row below without relying
  -- on the removed legacy doctors.enabled_service_tiers column.
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);

  INSERT INTO public.doctor_licenses(
    doctor_id,license_type,license_number,uf_brazil,status,cfm_validation_status,
    cfm_evidence_path,cfm_review_notes,cfm_reviewed_by,cfm_reviewed_at,cfm_last_checked_at
  ) VALUES(
    v_doc,'CRM','CI-'||v_doc::text,'RS','active','valid',
    'ci/'||v_doc::text||'/synthetic-cfm-evidence.pdf',
    'Synthetic manually reviewed CFM credential for isolated test',
    v_reviewer,now(),now()
  );

  IF NOT app_private.is_doctor_dispatch_approved(v_doc) THEN
    RAISE EXCEPTION 'Synthetic BR doctor must be CRM-approved';
  END IF;
  -- Keep ordinary BR/AR smoke requests out of the live queue before the
  -- doctor-presence trigger fires; otherwise the oldest ordinary BR request
  -- legitimately claims the only synthetic doctor before the paid Jordan probe.
  UPDATE public.pharmacy_dispatch_requests
  SET status='cancelled'
  WHERE id IN (v_br,v_ar);

  INSERT INTO public.doctor_duty_status(
    doctor_id,is_on_duty,last_heartbeat_at,duty_started_at,active_tiers
  ) VALUES(v_doc,true,now(),now(),ARRAY['general']::public.dispatch_tier_category[]);

  -- Neither the presence trigger nor a direct RPC may bypass the PSP gate.
  SELECT public.match_dispatch_doctors(v_jordan_unpaid_probe) INTO v_claim;
  IF v_claim->>'code' IS DISTINCT FROM 'JORDAN_PAYMENT_REQUIRED' THEN
    RAISE EXCEPTION 'Unpaid Jordan request must remain queued: %', v_claim;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers
    WHERE dispatch_request_id IN (v_jordan,v_jordan_unpaid_probe)
      AND doctor_id=v_doc
      AND status IN ('pending','accepted')
  ) THEN
    RAISE EXCEPTION 'Jordan physician offer was emitted before payment approval';
  END IF;

  -- Synthetic verifier proof, isolated to this rolled-back transaction.
  -- No CPF, phone number or live PSP credentials are stored in this fixture.
  INSERT INTO public.commercial_referral_identity_proofs(
    dispatch_request_id,referral_partner_id,subject_digest,
    verification_method,verification_receipt_id,verified_at
  ) VALUES(
    v_jordan,v_partner,repeat('a',64),'cpf_kyc',
    'ci-jordan-paid-'||v_jordan::text,now()
  );

  INSERT INTO public.pharmacy_dispatch_payments(
    dispatch_request_id,amount_minor,currency,provider,status
  ) VALUES(v_jordan,7900,'BRL','mercadopago','pending')
  RETURNING id INTO v_payment;

  UPDATE public.pharmacy_dispatch_payments
  SET status='approved',
      provider_payment_id='123456789012',
      paid_at=now()
  WHERE id=v_payment;

  -- The approval trigger must have dispatched the paid request. A direct
  -- matcher probe now returns OFFER_ALREADY_PENDING if the trigger worked;
  -- otherwise it exposes whether dispatch was queued or newly emitted.
  SELECT public.match_dispatch_doctors(v_jordan) INTO v_claim;
  IF v_claim->>'code' IS DISTINCT FROM 'OFFER_ALREADY_PENDING' THEN
    RAISE EXCEPTION 'Jordan PSP approval trigger did not leave a pending offer; matcher retry returned %', v_claim;
  END IF;

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
