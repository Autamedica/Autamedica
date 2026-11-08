-- Disposable local Supabase ONLY; transaction rolls back synthetic verification
-- receipts, payments and commercial ledger changes. Never run on real records.
BEGIN;

DO $guard$ BEGIN
  IF current_setting('autamedica.isolated_test',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'jordan_verified_first_conversion_requires_isolated_test';
  END IF;
END $guard$;

DO $test$
DECLARE
  v_partner uuid;
  v_first uuid := gen_random_uuid();
  v_repeat uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_later uuid := gen_random_uuid();
  v_unverified uuid := gen_random_uuid();
  v_wrong_amount uuid := gen_random_uuid();
  v_untrusted_receipt uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_first_digest text := repeat('a',64); -- synthetic HMAC-like test only
  v_other_digest text := repeat('b',64);
  v_wrong_amount_digest text := repeat('c',64);
  v_untrusted_receipt_digest text := repeat('d',64);
  v_err text;
BEGIN
  SELECT id INTO STRICT v_partner FROM public.commercial_referral_partners
  WHERE code='JORDAN' AND active;

  INSERT INTO public.pharmacy_dispatch_requests
    (id,patient_phone,patient_cpf,patient_name,tier_requested,
     cloudflare_room_id,status,care_country,referral_partner_id)
  VALUES
    (v_first,'51987654321','12345678909','SYNTHETIC FIRST','general',
      'ci-jordan-first-'||gen_random_uuid(),'searching','BR',v_partner),
    (v_repeat,'+55 (51) 98765-4321','98765432100','SYNTHETIC REPEAT','general',
      'ci-jordan-repeat-'||gen_random_uuid(),'searching','BR',v_partner),
    (v_other,'51987654322','98765432101','SYNTHETIC OTHER','general',
      'ci-jordan-other-'||gen_random_uuid(),'searching','BR',v_partner),
    (v_later,'+55 51 98765 4321','98765432102','SYNTHETIC LATER','general',
      'ci-jordan-later-'||gen_random_uuid(),'searching','BR',v_partner),
    (v_unverified,'51987654323','98765432103','SYNTHETIC UNVERIFIED','general',
      'ci-jordan-unverified-'||gen_random_uuid(),'searching','BR',v_partner);

  INSERT INTO public.pharmacy_dispatch_payments
    (id,dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES(v_payment,v_first,7900,'BRL','approved','9100000001',now());

  -- No verified identity -> no commission despite PSP-approved status and phone.
  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions
             WHERE dispatch_request_id=v_first) THEN
    RAISE EXCEPTION 'Unverified Jordan guest was awarded commission';
  END IF;

  -- A privileged direct SQL insert must NOT bypass the verified identity gate.
  BEGIN
    INSERT INTO public.commercial_referral_commissions
      (dispatch_request_id,dispatch_payment_id,referral_partner_id,
       amount_minor,currency,status)
    VALUES(v_first,v_payment,v_partner,1000,'BRL','eligible');
    RAISE EXCEPTION 'unverified_direct_ledger_write_was_accepted';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS v_err=MESSAGE_TEXT;
    IF v_err<>'jordan_verified_payment_and_subject_required' THEN
      RAISE EXCEPTION 'unexpected direct ledger rejection: %',v_err;
    END IF;
  END;

  -- KYC proof arriving AFTER payment must reconcile exactly once.
  INSERT INTO public.commercial_referral_identity_proofs
    (dispatch_request_id,referral_partner_id,subject_digest,
     verification_method,verification_receipt_id,verified_at)
  VALUES(v_first,v_partner,v_first_digest,'cpf_kyc','CI-KYC-10001',now());

  IF (SELECT COUNT(*) FROM public.commercial_referral_commissions
      WHERE dispatch_request_id=v_first AND status='eligible'
      AND amount_minor=1000 AND verified_subject_hash=v_first_digest)<>1 THEN
    RAISE EXCEPTION 'First verified BR conversion missing exactly one R$10 eligibility';
  END IF;

  -- The same verified person with a different guest phone cannot claim twice.
  INSERT INTO public.commercial_referral_identity_proofs
    (dispatch_request_id,referral_partner_id,subject_digest,
     verification_method,verification_receipt_id,verified_at)
  VALUES(v_repeat,v_partner,v_first_digest,'cpf_kyc','CI-KYC-10002',now());
  INSERT INTO public.pharmacy_dispatch_payments
    (dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES(v_repeat,7900,'BRL','approved','9100000002',now());

  IF EXISTS (SELECT 1 FROM public.commercial_referral_commissions
             WHERE dispatch_request_id=v_repeat) THEN
    RAISE EXCEPTION 'Duplicate verified person created a second commission';
  END IF;

  -- Different trusted identity -> one further eligible first conversion.
  INSERT INTO public.commercial_referral_identity_proofs
    (dispatch_request_id,referral_partner_id,subject_digest,
     verification_method,verification_receipt_id,verified_at)
  VALUES(v_other,v_partner,v_other_digest,'govbr','CI-GOVBR-10003',now());
  INSERT INTO public.pharmacy_dispatch_payments
    (dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES(v_other,7900,'BRL','approved','9100000003',now());
  IF (SELECT COUNT(*) FROM public.commercial_referral_commissions
      WHERE referral_partner_id=v_partner AND status='eligible')<>2 THEN
    RAISE EXCEPTION 'Distinct verified person not credited';
  END IF;

  -- Refund reverses the original commission and does not free the identity.
  UPDATE public.pharmacy_dispatch_payments
  SET status='refunded',paid_at=NULL WHERE id=v_payment;
  IF (SELECT status FROM public.commercial_referral_commissions
      WHERE dispatch_request_id=v_first)<>'reversed' THEN
    RAISE EXCEPTION 'Refund did not reverse Jordan commission';
  END IF;

  -- Reversed is a terminal state: no admin webhook may reopen payout status.
  BEGIN
    UPDATE public.commercial_referral_commissions
    SET status='eligible',reversed_at=NULL
    WHERE dispatch_request_id=v_first;
    RAISE EXCEPTION 'reversed_commission_was_reopened';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS v_err=MESSAGE_TEXT;
    IF v_err<>'reversed_commission_is_terminal' THEN
      RAISE EXCEPTION 'unexpected reversal guard: %',v_err;
    END IF;
  END;

  INSERT INTO public.commercial_referral_identity_proofs
    (dispatch_request_id,referral_partner_id,subject_digest,
     verification_method,verification_receipt_id,verified_at)
  VALUES(v_later,v_partner,v_first_digest,'cpf_kyc','CI-KYC-10004',now());
  INSERT INTO public.pharmacy_dispatch_payments
    (dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES(v_later,7900,'BRL','approved','9100000004',now());

  IF EXISTS(SELECT 1 FROM public.commercial_referral_commissions
            WHERE dispatch_request_id=v_later) THEN
    RAISE EXCEPTION 'Refunded first conversion incorrectly recredited';
  END IF;

  INSERT INTO public.pharmacy_dispatch_payments
    (dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES(v_unverified,7900,'BRL','approved','9100000005',now());

  IF EXISTS(SELECT 1 FROM public.commercial_referral_commissions
            WHERE dispatch_request_id=v_unverified) THEN
    RAISE EXCEPTION 'Unverified new contact incorrectly generated commission';
  END IF;

  -- Verified identity alone is insufficient if PSP approved the wrong
  -- patient amount: Jordan is exactly R$79.00, never arbitrary BRL amounts.
  INSERT INTO public.pharmacy_dispatch_requests
    (id,patient_phone,patient_cpf,patient_name,tier_requested,
     cloudflare_room_id,status,care_country,referral_partner_id)
  VALUES (v_wrong_amount,'51987654324','98765432104','SYNTHETIC WRONG AMOUNT',
          'general','ci-jordan-wrong-amount-'||gen_random_uuid(),'searching','BR',v_partner);
  INSERT INTO public.commercial_referral_identity_proofs
    (dispatch_request_id,referral_partner_id,subject_digest,
     verification_method,verification_receipt_id,verified_at)
  VALUES (v_wrong_amount,v_partner,v_wrong_amount_digest,'cpf_kyc','CI-KYC-AMOUNT-0001',now());
  INSERT INTO public.pharmacy_dispatch_payments
    (dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES (v_wrong_amount,8100,'BRL','approved','9100000006',now());
  IF EXISTS(SELECT 1 FROM public.commercial_referral_commissions
            WHERE dispatch_request_id=v_wrong_amount)
  THEN RAISE EXCEPTION 'Wrong R$81 amount incorrectly awarded Jordan commission'; END IF;

  -- A forged/alphanumeric provider_payment_id is not reconciled evidence,
  -- even if the database row status says approved and a proof row exists.
  INSERT INTO public.pharmacy_dispatch_requests
    (id,patient_phone,patient_cpf,patient_name,tier_requested,
     cloudflare_room_id,status,care_country,referral_partner_id)
  VALUES (v_untrusted_receipt,'51987654325','98765432105','SYNTHETIC UNTRUSTED RECEIPT',
          'general','ci-jordan-bad-receipt-'||gen_random_uuid(),'searching','BR',v_partner);
  INSERT INTO public.commercial_referral_identity_proofs
    (dispatch_request_id,referral_partner_id,subject_digest,
     verification_method,verification_receipt_id,verified_at)
  VALUES (v_untrusted_receipt,v_partner,v_untrusted_receipt_digest,
          'cpf_kyc','CI-KYC-RECEIPT-0001',now());
  INSERT INTO public.pharmacy_dispatch_payments
    (dispatch_request_id,amount_minor,currency,status,provider_payment_id,paid_at)
  VALUES (v_untrusted_receipt,7900,'BRL','approved','NOT_A_PROVIDER_PAYMENT_ID',now());
  IF EXISTS(SELECT 1 FROM public.commercial_referral_commissions
            WHERE dispatch_request_id=v_untrusted_receipt)
  THEN RAISE EXCEPTION 'Forged provider ID incorrectly awarded commission'; END IF;

  -- Replayed provider approval cannot duplicate an eligible commission.
  UPDATE public.pharmacy_dispatch_payments SET status='approved'
  WHERE dispatch_request_id=v_other;
  IF (SELECT COUNT(*) FROM public.commercial_referral_commissions
      WHERE referral_partner_id=v_partner)<>2 THEN
    RAISE EXCEPTION 'Duplicate webhook created extra commission';
  END IF;
END $test$;

ROLLBACK;
SELECT 'PASS: verified-first-subject Jordan, guest denied, duplicate denied, refund reversed'
  AS smoke_result;
