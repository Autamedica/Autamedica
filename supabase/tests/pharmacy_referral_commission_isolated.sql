-- Disposable local Supabase only. No real patients, payments or partner payouts.
-- Proves first Jordan acquisition by normalized Brazilian phone OR CPF.
BEGIN;
DO $guard$
BEGIN
  IF current_setting('autamedica.isolated_test',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'pharmacy referral smoke only runs in isolated_test';
  END IF;
END $guard$;

DO $test$
DECLARE
  partner uuid;
  dispatch_first uuid := '00000000-0000-4000-8000-00000000b101';
  dispatch_phone_repeat uuid := '00000000-0000-4000-8000-00000000b102';
  dispatch_cpf_repeat uuid := '00000000-0000-4000-8000-00000000b103';
  dispatch_direct uuid := '00000000-0000-4000-8000-00000000b104';
  dispatch_ar uuid := '00000000-0000-4000-8000-00000000b105';
  payment_first uuid := '00000000-0000-4000-8000-00000000b201';
  payment_phone_repeat uuid := '00000000-0000-4000-8000-00000000b202';
  payment_cpf_repeat uuid := '00000000-0000-4000-8000-00000000b203';
  payment_direct uuid := '00000000-0000-4000-8000-00000000b204';
  payment_ar uuid := '00000000-0000-4000-8000-00000000b205';
  err text;
BEGIN
  SELECT id INTO STRICT partner FROM public.commercial_referral_partners
  WHERE code='JORDAN' AND active;

  IF has_table_privilege('anon','public.commercial_referral_commissions','SELECT')
     OR has_table_privilege('authenticated','public.commercial_referral_commissions','SELECT')
     OR has_table_privilege('anon','public.pharmacy_dispatch_payments','INSERT')
  THEN RAISE EXCEPTION 'commercial ledgers exposed to client roles'; END IF;

  INSERT INTO public.pharmacy_dispatch_requests
    (id,patient_phone,patient_cpf,patient_name,tier_requested,
     cloudflare_room_id,status,care_country,referral_partner_id)
  VALUES
    (dispatch_first, '+55 (11) 1111-1111','12345678909','SYNTHETIC ONLY','general',
     'cf-room-referral-test-first','searching','BR',partner),
    (dispatch_phone_repeat, '551111111111','98765432100','SYNTHETIC ONLY','general',
     'cf-room-referral-test-phone-repeat','searching','BR',partner),
    (dispatch_cpf_repeat, '+55 (11) 2222-2222','123.456.789-09','SYNTHETIC ONLY','general',
     'cf-room-referral-test-cpf-repeat','searching','BR',partner),
    (dispatch_direct, '+55 (11) 3333-3333','32165498700','SYNTHETIC ONLY','general',
     'cf-room-referral-test-direct','searching','BR',NULL);

  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status)
  VALUES (payment_first,dispatch_first,7900,'BRL','initializing');

  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_first)
  THEN RAISE EXCEPTION 'unpaid pharmacy request created commission'; END IF;

  UPDATE public.pharmacy_dispatch_payments SET
    status='pending',provider_preference_id='TEST-CHECKOUT-FIRST',
    checkout_url='https://example.invalid/test/checkout-first'
  WHERE id=payment_first;
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_first)
  THEN RAISE EXCEPTION 'pending payment created commission'; END IF;

  UPDATE public.pharmacy_dispatch_payments SET
    status='approved',provider_payment_id='111111111111',paid_at=now()
  WHERE id=payment_first;
  IF (SELECT count(*) FROM public.commercial_referral_commissions
      WHERE dispatch_request_id=dispatch_first AND status='eligible' AND amount_minor=1000)<>1
  THEN RAISE EXCEPTION 'first Jordan paid contact did not create exactly one R$10 commission'; END IF;

  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES (payment_phone_repeat,dispatch_phone_repeat,7900,'BRL','approved','222222222222',now());
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_phone_repeat)
  THEN RAISE EXCEPTION 'repeat phone received a Jordan commission'; END IF;

  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES (payment_cpf_repeat,dispatch_cpf_repeat,7900,'BRL','approved','333333333333',now());
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_cpf_repeat)
  THEN RAISE EXCEPTION 'repeat CPF received a Jordan commission'; END IF;

  -- Direct BR payment is still R$79 but never creates a Jordan commission.
  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES (payment_direct,dispatch_direct,7900,'BRL','approved','444444444444',now());
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_direct)
  THEN RAISE EXCEPTION 'unattributed consultation was credited to Jordan'; END IF;

  -- A repeated webhook cannot duplicate the first commission.
  UPDATE public.pharmacy_dispatch_payments SET status='approved' WHERE id=payment_first;
  IF (SELECT count(*) FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_first)<>1
  THEN RAISE EXCEPTION 'duplicate commercial commission'; END IF;

  UPDATE public.commercial_referral_commissions
  SET status='paid', payment_reference='CI-TRANSFER-REF', paid_at=now()
  WHERE dispatch_request_id=dispatch_first AND status='eligible';
  UPDATE public.pharmacy_dispatch_payments SET status='refunded',paid_at=NULL WHERE id=payment_first;
  IF (SELECT status FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_first)<>'reversed'
  THEN RAISE EXCEPTION 'refund failed to reverse commission'; END IF;

  BEGIN
    UPDATE public.pharmacy_dispatch_payments SET status='approved',paid_at=now() WHERE id=payment_first;
    RAISE EXCEPTION 'refunded payment was reopened';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err='refunded payment was reopened' THEN RAISE; END IF;
    IF err<>'pharmacy_refunded_payment_terminal' THEN
      RAISE EXCEPTION 'unexpected refund guard: %',err;
    END IF;
  END;

  -- Jordan attribution must never be accepted for an Argentine dispatch.
  BEGIN
    INSERT INTO public.pharmacy_dispatch_requests
      (id,patient_phone,patient_dni,patient_name,tier_requested,
       cloudflare_room_id,status,care_country,referral_partner_id)
    VALUES (dispatch_ar,'54911000000','38123456','SYNTHETIC ONLY','general',
            'cf-room-referral-test-ar','searching','AR',partner);
    RAISE EXCEPTION 'ar_jordan_was_accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err NOT IN ('jordan_referral_brazil_only','jordan_br_general_only') THEN
      RAISE EXCEPTION 'unexpected AR rejection: %',err;
    END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.pharmacy_dispatch_requests WHERE id=dispatch_ar)
  THEN RAISE EXCEPTION 'AR Jordan dispatch escaped guard'; END IF;

  INSERT INTO public.pharmacy_dispatch_requests
    (id,patient_phone,patient_dni,patient_name,tier_requested,
     cloudflare_room_id,status,care_country,referral_partner_id)
  VALUES (dispatch_ar,'54911000000','38123456','SYNTHETIC ONLY','general',
          'cf-room-referral-test-ar','searching','AR',NULL);
  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES (payment_ar,dispatch_ar,7900,'BRL','approved','555555555555',now());
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_ar)
  THEN RAISE EXCEPTION 'Argentina dispatch was incorrectly credited in BRL'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: first Jordan acquisition by phone OR CPF; repeats and direct channel earn R$0; refunds reverse R$10' AS smoke_result;
