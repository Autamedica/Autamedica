-- Phase 1: commercial QR attribution. No payments, clinical access, or commission payouts.
-- The code identifies a promotional source, not a licensed pharmacy.
CREATE TABLE IF NOT EXISTS public.commercial_referral_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commercial_referral_partners IS
  'Non-clinical commercial QR origins. No medical or patient information.';

ALTER TABLE public.commercial_referral_partners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commercial_referral_partners FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commercial_referral_partners TO service_role;

INSERT INTO public.commercial_referral_partners (code, display_name)
VALUES ('JORDAN', 'Cantina Jordan')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS referral_partner_id uuid NULL
  REFERENCES public.commercial_referral_partners(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.pharmacy_dispatch_requests.referral_partner_id IS
  'Server-validated non-clinical QR origin captured at intake; not payment proof or commission authorization.';

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_referral_partner_created
  ON public.pharmacy_dispatch_requests (referral_partner_id, created_at)
  WHERE referral_partner_id IS NOT NULL;

-- Server-side attribution must never be switched to another commercial partner.
-- The existing request's patient/country RLS and access restrictions stay unchanged.
CREATE OR REPLACE FUNCTION public.guard_pharmacy_referral_attribution()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.referral_partner_id IS DISTINCT FROM OLD.referral_partner_id THEN
    RAISE EXCEPTION 'referral_attribution_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pharmacy_referral_attribution() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_pharmacy_referral_attribution_update ON public.pharmacy_dispatch_requests;
CREATE TRIGGER guard_pharmacy_referral_attribution_update
  BEFORE UPDATE OF referral_partner_id ON public.pharmacy_dispatch_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_pharmacy_referral_attribution();
