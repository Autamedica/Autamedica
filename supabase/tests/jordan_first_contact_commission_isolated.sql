-- Isolated local test only, synthetic referrals and payment IDs, no transfers.
BEGIN;
DO $guard$ BEGIN
  IF current_setting('autamedica.isolated_test',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'jordan_first_contact_requires_isolated_test';
  END IF;
END $guard$;

DO $test$
DECLARE
  v_partner uuid;
  v_first uuid := gen_random_uuid();
  v_repeat uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_later uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
BEGIN
  SELECT id INTO STRICT v_partner
    FROM public.commercial_referral_partners WHERE code='JORDAN' AND active;

  INSERT INTO public.pharmacy_dispatch_requests (
    id,patient_phone,patient_cpf,patient_name,tier_requested,
    cloudflare_room_id,status,care_country,referral_partner_id
  ) VALUES
    (v_first,'51987654321','12345678909','SYNTHETIC FIRST','general',
     'ci-jordan-first-'||gen_random_uuid(),'searching','BR',v_partner),
    (v_repeat,'+55 (51) 98765-4321','98765432100','SYNTHETIC REPEAT','general',
     'ci-jordan-repeat-'||gen_random_uuid(),'searching','BR',v_partner),
    (v_other,'51987654322','98765432101','SYNTHETIC OTHER','general',
     'ci-jordan-other-'||gen_random_uuid(),'searching','BR',v_partner),
    (v_later,'+55 51 98765 4321','98765432102','SYNTHETIC LATER','general',
     'ci-jordan-later-'||gen_random_uuid(),'searching','BR',v_partner);

  INSERT INTO public.pharmacy_dispatch_payments (
    id,dispatch_request_id,amount_minor,currency,status,
    provider_payment_id,paid_at
  ) VALUES (v_payment,v_first,7900,'BRL','approved','1000000001',now());

  IF (SELECT count(*) FROM public.commercial_referral_commissions
      WHERE dispatch_request_id=v_first AND amount_minor=1000 AND status='eligible') <> 1
  THEN RAISE EXCEPTION 'First Jordan contact did not receive one provisional R$10'; END IF;

  INSERT INTO public.pharmacy_dispatch_payments (
    dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at
  ) VALUES (v_repeat,7900,'BRL','approved','1000000002',now());

  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions
             WHERE dispatch_request_id=v_repeat)
  THEN RAISE EXCEPTION 'Repeat contact incorrectly generated commission'; END IF;

  INSERT INTO public.pharmacy_dispatch_payments (
    dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at
  ) VALUES (v_other,7900,'BRL','approved','1000000003',now());

  IF (SELECT count(*) FROM public.commercial_referral_commissions c
      WHERE c.referral_partner_id=v_partner AND c.status='eligible')<>2
  THEN RAISE EXCEPTION 'A different first contact must remain eligible'; END IF;

  UPDATE public.pharmacy_dispatch_payments
  SET status='refunded',paid_at=NULL WHERE id=v_payment;

  IF (SELECT status FROM public.commercial_referral_commissions
      WHERE dispatch_request_id=v_first)<>'reversed'
  THEN RAISE EXCEPTION 'Refund did not reverse the first commercial commission'; END IF;

  INSERT INTO public.pharmacy_dispatch_payments (
    dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at
  ) VALUES (v_later,7900,'BRL','approved','1000000004',now());

  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions
             WHERE dispatch_request_id=v_later)
  THEN RAISE EXCEPTION 'Refunded first acquisition must not be credited twice'; END IF;

  IF (SELECT count(*) FROM public.commercial_referral_commissions
      WHERE referral_partner_id=v_partner)<>2
  THEN RAISE EXCEPTION 'Total first-contact commission count is wrong'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: Jordan commission first contact only; refund reversed' AS smoke_result;
