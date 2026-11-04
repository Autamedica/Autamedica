-- Disposable local Supabase only. No real patients, payments or partner payouts.
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
  dispatch_br uuid := '00000000-0000-4000-8000-00000000b101';
  dispatch_anon uuid := '00000000-0000-4000-8000-00000000b102';
  dispatch_ar uuid := '00000000-0000-4000-8000-00000000b103';
  payment_br uuid := '00000000-0000-4000-8000-00000000b201';
  payment_anon uuid := '00000000-0000-4000-8000-00000000b202';
  payment_ar uuid := '00000000-0000-4000-8000-00000000b203';
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
    (dispatch_br, '555111111111','12345678909','SYNTHETIC ONLY','general',
     'cf-room-referral-test-br-1','searching','BR',partner),
    (dispatch_anon, '555111111112','98765432100','SYNTHETIC ONLY','general',
     'cf-room-referral-test-br-2','searching','BR',NULL);

  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status)
  VALUES (payment_br,dispatch_br,7900,'BRL','initializing');
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_br)
  THEN RAISE EXCEPTION 'unpaid pharmacy request created commission'; END IF;

  UPDATE public.pharmacy_dispatch_payments SET
    status='pending',provider_preference_id='TEST-CHECKOUT-1',
    checkout_url='https://example.invalid/test/checkout-1'
  WHERE id=payment_br;
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_br)
  THEN RAISE EXCEPTION 'pending payment created commission'; END IF;

  UPDATE public.pharmacy_dispatch_payments SET
    status='approved',provider_payment_id='111111111111',paid_at=now()
  WHERE id=payment_br;
  IF (SELECT count(*) FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_br AND status='eligible' AND amount_minor=1000)<>1
  THEN RAISE EXCEPTION 'Jordan BR paid consultation did not create R$10 eligibility'; END IF;

  -- Replayed webhook cannot create another commission.
  UPDATE public.pharmacy_dispatch_payments SET status='approved' WHERE id=payment_br;
  IF (SELECT count(*) FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_br)<>1
  THEN RAISE EXCEPTION 'duplicate commercial commission'; END IF;

  UPDATE public.pharmacy_dispatch_payments SET status='refunded',paid_at=NULL WHERE id=payment_br;
  IF (SELECT status FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_br)<>'reversed'
  THEN RAISE EXCEPTION 'refund failed to reverse commission'; END IF;

  BEGIN
    UPDATE public.pharmacy_dispatch_payments SET status='approved',paid_at=now() WHERE id=payment_br;
    RAISE EXCEPTION 'refunded payment was reopened';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    IF err='refunded payment was reopened' THEN RAISE; END IF;
    IF err<>'pharmacy_refunded_payment_terminal' THEN
      RAISE EXCEPTION 'unexpected refund guard: %',err;
    END IF;
  END;

  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES (payment_anon,dispatch_anon,7900,'BRL','approved','222222222222',now());
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_anon)
  THEN RAISE EXCEPTION 'unattributed consultation was credited to Jordan'; END IF;

  INSERT INTO public.pharmacy_dispatch_requests
    (id,patient_phone,patient_dni,patient_name,tier_requested,
     cloudflare_room_id,status,care_country,referral_partner_id)
  VALUES (dispatch_ar,'54911000000','38123456','SYNTHETIC ONLY','general',
          'cf-room-referral-test-ar','searching','AR',partner);
  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES (payment_ar,dispatch_ar,7900,'BRL','approved','333333333333',now());
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions WHERE dispatch_request_id=dispatch_ar)
  THEN RAISE EXCEPTION 'Argentina dispatch was incorrectly credited in BRL'; END IF;
END $test$;
ROLLBACK;
SELECT 'PASS: pharmacy referral isolated commission ledger' AS smoke_result;
