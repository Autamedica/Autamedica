-- Jordan commission release gate: verified first conversion, not guest-phone identity.
-- Code only until disposable DB replay + CI. This migration does NOT alter
-- payment activation, patient checkout, medical fees or partner transfers.
-- An external trusted CPF/GovBR verifier must validate the proof BEFORE a
-- service-role backend records the HMAC-SHA256 subject digest.
-- NEVER store a raw CPF, telephone, unsalted CPF hash or clinical notes here.
BEGIN;

CREATE TABLE IF NOT EXISTS public.commercial_referral_identity_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_request_id uuid NOT NULL UNIQUE
    REFERENCES public.pharmacy_dispatch_requests(id) ON DELETE RESTRICT,
  referral_partner_id uuid NOT NULL
    REFERENCES public.commercial_referral_partners(id) ON DELETE RESTRICT,
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  verification_method text NOT NULL
    CHECK (verification_method IN ('cpf_kyc', 'govbr')),
  verification_receipt_id text NOT NULL UNIQUE
    CHECK (char_length(verification_receipt_id) BETWEEN 8 AND 160),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commercial_referral_identity_proofs IS
  'Nonclinical, immutable evidence from a trusted identity verifier; only server-side keyed HMAC of verified subject, never raw CPF/phone/health data. This table is empty until a real verifier is integrated.';
COMMENT ON COLUMN public.commercial_referral_identity_proofs.subject_digest IS
  'HMAC-SHA256 hex of verifier-confirmed stable subject ID with a backend-held secret, not a raw or unsalted document hash.';
COMMENT ON COLUMN public.commercial_referral_identity_proofs.verification_receipt_id IS
  'Opaque reference to authenticated external verifier event. Must not contain CPF/phone.';

ALTER TABLE public.commercial_referral_identity_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_referral_identity_proofs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.commercial_referral_identity_proofs TO service_role;

-- Existing rows remain unchanged. No legacy phone-based eligible commission
-- is silently promoted to a verified commission.
ALTER TABLE public.commercial_referral_commissions
  ADD COLUMN IF NOT EXISTS verified_subject_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS
  commercial_first_verified_subject_partner_key
  ON public.commercial_referral_commissions(referral_partner_id,verified_subject_hash)
  WHERE verified_subject_hash IS NOT NULL;

DO $format$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.commercial_referral_commissions'::regclass
      AND conname='commercial_verified_subject_hash_format'
  ) THEN
    ALTER TABLE public.commercial_referral_commissions
      ADD CONSTRAINT commercial_verified_subject_hash_format
      CHECK (verified_subject_hash IS NULL
             OR verified_subject_hash ~ '^[0-9a-f]{64}
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.commercial_referral_commissions c
    JOIN public.commercial_referral_partners p ON p.id=c.referral_partner_id
    WHERE p.code='JORDAN' AND c.status='eligible'
      AND c.verified_subject_hash IS NULL
  ) THEN
    RAISE EXCEPTION 'jordan_legacy_unverified_commissions_require_manual_reconciliation';
  END IF;
END;
$legacy$;

CREATE OR REPLACE FUNCTION app_private.guard_commercial_identity_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $proof$
DECLARE
  v_partner uuid;
  v_country text;
  v_code text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'commercial_identity_proof_immutable' USING ERRCODE='42501';
  END IF;
  SELECT r.referral_partner_id,r.care_country,p.code
  INTO v_partner,v_country,v_code
  FROM public.pharmacy_dispatch_requests r
  JOIN public.commercial_referral_partners p ON p.id=r.referral_partner_id
  WHERE r.id=NEW.dispatch_request_id;

  IF v_partner IS DISTINCT FROM NEW.referral_partner_id
     OR v_country IS DISTINCT FROM 'BR'
     OR v_code IS DISTINCT FROM 'JORDAN'
  THEN
    RAISE EXCEPTION 'verified_jordan_br_dispatch_required' USING ERRCODE='23514';
  END IF;
  IF NEW.verified_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'verification_event_in_future' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$proof$;

REVOKE ALL ON FUNCTION app_private.guard_commercial_identity_proof()
FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_commercial_identity_proof_guard
ON public.commercial_referral_identity_proofs;
CREATE TRIGGER trg_commercial_identity_proof_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.commercial_referral_identity_proofs
FOR EACH ROW EXECUTE FUNCTION app_private.guard_commercial_identity_proof();

-- Serialize first-conversion claims by the trusted provider subject key.
-- Concurrent approvals/duplicate webhook replays cannot award twice.
CREATE OR REPLACE FUNCTION app_private.try_credit_verified_jordan(p_dispatch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $credit$
DECLARE
  v_partner uuid;
  v_subject text;
  v_payment uuid;
BEGIN
  SELECT r.referral_partner_id,proof.subject_digest,pay.id
  INTO v_partner,v_subject,v_payment
  FROM public.pharmacy_dispatch_requests r
  JOIN public.commercial_referral_partners partner
    ON partner.id=r.referral_partner_id
  JOIN public.commercial_referral_identity_proofs proof
    ON proof.dispatch_request_id=r.id
      AND proof.referral_partner_id=r.referral_partner_id
  JOIN public.pharmacy_dispatch_payments pay
    ON pay.dispatch_request_id=r.id
  WHERE r.id=p_dispatch_id
    AND r.care_country='BR'
    AND r.tier_requested::text='general'
    AND partner.code='JORDAN' AND partner.active IS TRUE
    AND pay.status='approved'
    AND pay.provider='mercadopago'
    AND pay.provider_payment_id ~ '^[0-9]{1,20}$'
    AND pay.amount_minor=7900
    AND pay.currency='BRL'
    AND pay.paid_at IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_partner::text),
    pg_catalog.hashtext(v_subject)
  );

  IF EXISTS (
    SELECT 1 FROM public.commercial_referral_commissions c
    WHERE c.referral_partner_id=v_partner
      AND c.verified_subject_hash=v_subject
  ) THEN RETURN; END IF;

  INSERT INTO public.commercial_referral_commissions
    (dispatch_request_id,dispatch_payment_id,referral_partner_id,
     amount_minor,currency,status,verified_subject_hash)
  VALUES
    (p_dispatch_id,v_payment,v_partner,1000,'BRL','eligible',v_subject)
  ON CONFLICT DO NOTHING; -- two independent unique keys, never double credit
END;
$credit$;

REVOKE ALL ON FUNCTION app_private.try_credit_verified_jordan(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.try_credit_verified_jordan(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_pharmacy_referral_commission()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog,public AS $sync$
DECLARE
  v_partner uuid;
  v_country text;
  v_code text;
BEGIN
  IF NEW.status='approved' THEN
    SELECT r.referral_partner_id,r.care_country,p.code
      INTO v_partner,v_country,v_code
    FROM public.pharmacy_dispatch_requests r
    LEFT JOIN public.commercial_referral_partners p
      ON p.id=r.referral_partner_id
    WHERE r.id=NEW.dispatch_request_id;

    IF v_partner IS NULL OR v_country IS DISTINCT FROM 'BR' THEN RETURN NEW; END IF;
    IF v_code='JORDAN' THEN
      PERFORM app_private.try_credit_verified_jordan(NEW.dispatch_request_id);
      RETURN NEW;
    END IF;

    -- Preserve the preexisting independent commercial policy for other partners.
    INSERT INTO public.commercial_referral_commissions
      (dispatch_request_id,dispatch_payment_id,referral_partner_id,
       amount_minor,currency,status)
    VALUES(NEW.dispatch_request_id,NEW.id,v_partner,1000,'BRL','eligible')
    ON CONFLICT (dispatch_request_id) DO NOTHING;

  ELSIF NEW.status IN ('refunded','cancelled','rejected') THEN
    UPDATE public.commercial_referral_commissions
       SET status='reversed',reversed_at=now()
     WHERE dispatch_payment_id=NEW.id AND status='eligible';
  END IF;
  RETURN NEW;
END;
$sync$;

REVOKE ALL ON FUNCTION public.sync_pharmacy_referral_commission()
FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.credit_jordan_on_verified_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $after$
BEGIN
  PERFORM app_private.try_credit_verified_jordan(NEW.dispatch_request_id);
  RETURN NEW;
END;
$after$;
REVOKE ALL ON FUNCTION app_private.credit_jordan_on_verified_proof()
FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_credit_jordan_on_verified_proof
ON public.commercial_referral_identity_proofs;
CREATE TRIGGER trg_credit_jordan_on_verified_proof
AFTER INSERT ON public.commercial_referral_identity_proofs
FOR EACH ROW EXECUTE FUNCTION app_private.credit_jordan_on_verified_proof();

COMMENT ON FUNCTION public.sync_pharmacy_referral_commission() IS
  'Only verified subject-backed first paid Jordan BR conversion can become eligible; phone/guest identity never qualifies. Reversals on refund; no transfer automation.';

COMMIT;
);
  END IF;
END;
$format$;

DO $legacy$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.commercial_referral_commissions c
    JOIN public.commercial_referral_partners p ON p.id=c.referral_partner_id
    WHERE p.code='JORDAN' AND c.status='eligible'
      AND c.verified_subject_hash IS NULL
  ) THEN
    RAISE EXCEPTION 'jordan_legacy_unverified_commissions_require_manual_reconciliation';
  END IF;
END;
$legacy$;

CREATE OR REPLACE FUNCTION app_private.guard_commercial_identity_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $proof$
DECLARE
  v_partner uuid;
  v_country text;
  v_code text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'commercial_identity_proof_immutable' USING ERRCODE='42501';
  END IF;
  SELECT r.referral_partner_id,r.care_country,p.code
  INTO v_partner,v_country,v_code
  FROM public.pharmacy_dispatch_requests r
  JOIN public.commercial_referral_partners p ON p.id=r.referral_partner_id
  WHERE r.id=NEW.dispatch_request_id;

  IF v_partner IS DISTINCT FROM NEW.referral_partner_id
     OR v_country IS DISTINCT FROM 'BR'
     OR v_code IS DISTINCT FROM 'JORDAN'
  THEN
    RAISE EXCEPTION 'verified_jordan_br_dispatch_required' USING ERRCODE='23514';
  END IF;
  IF NEW.verified_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'verification_event_in_future' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$proof$;

REVOKE ALL ON FUNCTION app_private.guard_commercial_identity_proof()
FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_commercial_identity_proof_guard
ON public.commercial_referral_identity_proofs;
CREATE TRIGGER trg_commercial_identity_proof_guard
BEFORE INSERT OR UPDATE OR DELETE
ON public.commercial_referral_identity_proofs
FOR EACH ROW EXECUTE FUNCTION app_private.guard_commercial_identity_proof();

-- Serialize first-conversion claims by the trusted provider subject key.
-- Concurrent approvals/duplicate webhook replays cannot award twice.
CREATE OR REPLACE FUNCTION app_private.try_credit_verified_jordan(p_dispatch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $credit$
DECLARE
  v_partner uuid;
  v_subject text;
  v_payment uuid;
BEGIN
  SELECT r.referral_partner_id,proof.subject_digest,pay.id
  INTO v_partner,v_subject,v_payment
  FROM public.pharmacy_dispatch_requests r
  JOIN public.commercial_referral_partners partner
    ON partner.id=r.referral_partner_id
  JOIN public.commercial_referral_identity_proofs proof
    ON proof.dispatch_request_id=r.id
      AND proof.referral_partner_id=r.referral_partner_id
  JOIN public.pharmacy_dispatch_payments pay
    ON pay.dispatch_request_id=r.id
  WHERE r.id=p_dispatch_id
    AND r.care_country='BR'
    AND r.tier_requested::text='general'
    AND partner.code='JORDAN' AND partner.active IS TRUE
    AND pay.status='approved'
    AND pay.provider='mercadopago'
    AND pay.provider_payment_id ~ '^[0-9]{1,20}$'
    AND pay.amount_minor=7900
    AND pay.currency='BRL'
    AND pay.paid_at IS NOT NULL;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_partner::text),
    pg_catalog.hashtext(v_subject)
  );

  IF EXISTS (
    SELECT 1 FROM public.commercial_referral_commissions c
    WHERE c.referral_partner_id=v_partner
      AND c.verified_subject_hash=v_subject
  ) THEN RETURN; END IF;

  INSERT INTO public.commercial_referral_commissions
    (dispatch_request_id,dispatch_payment_id,referral_partner_id,
     amount_minor,currency,status,verified_subject_hash)
  VALUES
    (p_dispatch_id,v_payment,v_partner,1000,'BRL','eligible',v_subject)
  ON CONFLICT DO NOTHING; -- two independent unique keys, never double credit
END;
$credit$;

REVOKE ALL ON FUNCTION app_private.try_credit_verified_jordan(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.try_credit_verified_jordan(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_pharmacy_referral_commission()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog,public AS $sync$
DECLARE
  v_partner uuid;
  v_country text;
  v_code text;
BEGIN
  IF NEW.status='approved' THEN
    SELECT r.referral_partner_id,r.care_country,p.code
      INTO v_partner,v_country,v_code
    FROM public.pharmacy_dispatch_requests r
    LEFT JOIN public.commercial_referral_partners p
      ON p.id=r.referral_partner_id
    WHERE r.id=NEW.dispatch_request_id;

    IF v_partner IS NULL OR v_country IS DISTINCT FROM 'BR' THEN RETURN NEW; END IF;
    IF v_code='JORDAN' THEN
      PERFORM app_private.try_credit_verified_jordan(NEW.dispatch_request_id);
      RETURN NEW;
    END IF;

    -- Preserve the preexisting independent commercial policy for other partners.
    INSERT INTO public.commercial_referral_commissions
      (dispatch_request_id,dispatch_payment_id,referral_partner_id,
       amount_minor,currency,status)
    VALUES(NEW.dispatch_request_id,NEW.id,v_partner,1000,'BRL','eligible')
    ON CONFLICT (dispatch_request_id) DO NOTHING;

  ELSIF NEW.status IN ('refunded','cancelled','rejected') THEN
    UPDATE public.commercial_referral_commissions
       SET status='reversed',reversed_at=now()
     WHERE dispatch_payment_id=NEW.id AND status='eligible';
  END IF;
  RETURN NEW;
END;
$sync$;

REVOKE ALL ON FUNCTION public.sync_pharmacy_referral_commission()
FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.credit_jordan_on_verified_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $after$
BEGIN
  PERFORM app_private.try_credit_verified_jordan(NEW.dispatch_request_id);
  RETURN NEW;
END;
$after$;
REVOKE ALL ON FUNCTION app_private.credit_jordan_on_verified_proof()
FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_credit_jordan_on_verified_proof
ON public.commercial_referral_identity_proofs;
CREATE TRIGGER trg_credit_jordan_on_verified_proof
AFTER INSERT ON public.commercial_referral_identity_proofs
FOR EACH ROW EXECUTE FUNCTION app_private.credit_jordan_on_verified_proof();

COMMENT ON FUNCTION public.sync_pharmacy_referral_commission() IS
  'Only verified subject-backed first paid Jordan BR conversion can become eligible; phone/guest identity never qualifies. Reversals on refund; no transfer automation.';

COMMIT;
