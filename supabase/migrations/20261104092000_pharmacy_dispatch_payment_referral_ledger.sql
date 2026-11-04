-- Explicit financial evidence for pharmacy on-demand requests.
-- Never infer money from a QR scan, CPF, patient name, phone or medical note.
CREATE TABLE IF NOT EXISTS public.pharmacy_dispatch_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_request_id uuid NOT NULL UNIQUE
    REFERENCES public.pharmacy_dispatch_requests(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor BETWEEN 1000 AND 10000000),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  provider text NOT NULL DEFAULT 'mercadopago' CHECK (provider = 'mercadopago'),
  provider_preference_id text UNIQUE,
  provider_payment_id text UNIQUE,
  checkout_url text,
  status text NOT NULL DEFAULT 'initializing'
    CHECK (status IN ('initializing','pending','approved','rejected','cancelled','refunded','failed')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pharmacy_payment_approved_requires_proof
    CHECK (status <> 'approved' OR (provider_payment_id IS NOT NULL AND paid_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.commercial_referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_request_id uuid NOT NULL UNIQUE
    REFERENCES public.pharmacy_dispatch_requests(id) ON DELETE RESTRICT,
  dispatch_payment_id uuid NOT NULL UNIQUE
    REFERENCES public.pharmacy_dispatch_payments(id) ON DELETE RESTRICT,
  referral_partner_id uuid NOT NULL
    REFERENCES public.commercial_referral_partners(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL DEFAULT 1000 CHECK (amount_minor = 1000),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency='BRL'),
  status text NOT NULL DEFAULT 'eligible' CHECK (status IN ('eligible','reversed')),
  eligible_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pharmacy_dispatch_payments IS
  'Commercial payment evidence for a pharmacy dispatch, only after independent Mercado Pago verification. No patient identifiers or clinical details.';
COMMENT ON TABLE public.commercial_referral_commissions IS
  'R$10 provisional commercial accounting per verified BRL pharmacy payment; no payout automation. No patient identifiers or clinical details.';

CREATE INDEX IF NOT EXISTS idx_pharmacy_payments_status ON public.pharmacy_dispatch_payments(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_partner_status ON public.commercial_referral_commissions(referral_partner_id,status,created_at DESC);

ALTER TABLE public.pharmacy_dispatch_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_referral_commissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pharmacy_dispatch_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commercial_referral_commissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pharmacy_dispatch_payments TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_referral_commissions TO service_role;

CREATE OR REPLACE FUNCTION public.guard_pharmacy_dispatch_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
BEGIN
  IF NEW.dispatch_request_id IS DISTINCT FROM OLD.dispatch_request_id
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR (OLD.provider_preference_id IS NOT NULL AND NEW.provider_preference_id IS DISTINCT FROM OLD.provider_preference_id)
    OR (OLD.provider_payment_id IS NOT NULL AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id)
  THEN
    RAISE EXCEPTION 'pharmacy_payment_identity_immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'refunded' AND NEW.status <> 'refunded' THEN
    RAISE EXCEPTION 'pharmacy_refunded_payment_terminal' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'approved' AND NEW.status IN ('initializing','pending','failed') THEN
    RAISE EXCEPTION 'pharmacy_approved_payment_cannot_regress' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_pharmacy_dispatch_payment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_guard_pharmacy_dispatch_payment ON public.pharmacy_dispatch_payments;
CREATE TRIGGER trg_guard_pharmacy_dispatch_payment
  BEFORE UPDATE ON public.pharmacy_dispatch_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_pharmacy_dispatch_payment();

CREATE OR REPLACE FUNCTION public.sync_pharmacy_referral_commission()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog,public AS $$
DECLARE
  v_partner uuid;
  v_country text;
BEGIN
  IF NEW.status = 'approved' THEN
    SELECT referral_partner_id,care_country INTO v_partner,v_country
      FROM public.pharmacy_dispatch_requests WHERE id = NEW.dispatch_request_id;
    IF v_partner IS NOT NULL AND v_country = 'BR' THEN
      INSERT INTO public.commercial_referral_commissions (
        dispatch_request_id,dispatch_payment_id,referral_partner_id,amount_minor,currency,status
      ) VALUES (
        NEW.dispatch_request_id,NEW.id,v_partner,1000,'BRL','eligible'
      ) ON CONFLICT (dispatch_request_id) DO NOTHING;
    END IF;
  ELSIF NEW.status IN ('refunded','cancelled','rejected') THEN
    UPDATE public.commercial_referral_commissions
       SET status = 'reversed', reversed_at = now()
     WHERE dispatch_payment_id = NEW.id AND status = 'eligible';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_pharmacy_referral_commission() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_sync_pharmacy_referral_commission ON public.pharmacy_dispatch_payments;
CREATE TRIGGER trg_sync_pharmacy_referral_commission
  AFTER INSERT OR UPDATE OF status ON public.pharmacy_dispatch_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_pharmacy_referral_commission();
