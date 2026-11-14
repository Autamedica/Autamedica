-- Disposable local Supabase ONLY; synthetic requests and payments roll back.
BEGIN;
DO $guard$
BEGIN
  IF current_setting('autamedica.isolated_test',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'jordan_first_contact_requires_isolated_test';
  END IF;
END $guard$;

DO $test$
DECLARE
  v_partner uuid;
  v_first uuid := gen_random_uuid();
  v_repeat_phone uuid := gen_random_uuid();
  v_repeat_cpf uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_payment_phone uuid := gen_random_uuid();
  v_payment_cpf uuid := gen_random_uuid();
BEGIN
  SELECT id INTO STRICT v_partner FROM public.commercial_referral_partners
  WHERE code='JORDAN' AND active;

  INSERT INTO public.pharmacy_dispatch_requests
    (id,patient_phone,patient_cpf,patient_name,tier_requested,cloudflare_room_id,status,care_country,referral_partner_id)
  VALUES
    (v_first,'+55 (11) 98765-4321','12345678909','SYNTHETIC FIRST','general','ci-jordan-first-'||v_first,'cancelled','BR',v_partner),
    (v_repeat_phone,'5511987654321','98765432100','SYNTHETIC PHONE REPEAT','general','ci-jordan-phone-repeat-'||v_repeat_phone,'cancelled','BR',v_partner),
    (v_repeat_cpf,'+55 (11) 99999-1111','123.456.789-09','SYNTHETIC CPF REPEAT','general','ci-jordan-cpf-repeat-'||v_repeat_cpf,'cancelled','BR',v_partner);

  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,provider,status)
  VALUES
    (v_payment,v_first,7900,'BRL','mercadopago','initializing'),
    (v_payment_phone,v_repeat_phone,7900,'BRL','mercadopago','initializing'),
    (v_payment_cpf,v_repeat_cpf,7900,'BRL','mercadopago','initializing');

  UPDATE public.pharmacy_dispatch_payments
  SET status='pending',
      provider_preference_id='CI-JORDAN-'||id::text,
      checkout_url='https://example.invalid/ci/'||id::text
  WHERE id IN (v_payment,v_payment_phone,v_payment_cpf);

  UPDATE public.pharmacy_dispatch_payments
  SET status='approved',
      provider_payment_id=CASE
        WHEN id=v_payment THEN '9100000001'
        WHEN id=v_payment_phone THEN '9100000002'
        ELSE '9100000003'
      END,
      paid_at=now()
  WHERE id IN (v_payment,v_payment_phone,v_payment_cpf);

  IF (SELECT count(*) FROM public.commercial_referral_commissions
      WHERE dispatch_request_id=v_first AND amount_minor=1000 AND status='eligible')<>1 THEN
    RAISE EXCEPTION 'First Jordan contact must receive exactly R$10';
  END IF;

  IF EXISTS(SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id IN (v_repeat_phone,v_repeat_cpf)) THEN
    RAISE EXCEPTION 'Repeat phone OR CPF must receive R$0';
  END IF;

  UPDATE public.pharmacy_dispatch_payments SET status='refunded',paid_at=NULL WHERE id=v_payment;
  IF (SELECT status FROM public.commercial_referral_commissions WHERE dispatch_request_id=v_first)<>'reversed' THEN
    RAISE EXCEPTION 'Refund must reverse the R$10 commission';
  END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: first Jordan paid consultation R$10; repeat phone/CPF R$0; refund reverses' AS smoke_result;
