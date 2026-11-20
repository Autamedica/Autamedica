BEGIN;

ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS referral_source_code text NULL;

ALTER TABLE public.pharmacy_dispatch_payments
  ADD COLUMN IF NOT EXISTS referral_source_code text NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_dispatch_requests'::regclass
      AND conname = 'pharmacy_dispatch_requests_referral_source_code_format_ck'
  ) THEN
    ALTER TABLE public.pharmacy_dispatch_requests
      ADD CONSTRAINT pharmacy_dispatch_requests_referral_source_code_format_ck
      CHECK (referral_source_code IS NULL OR referral_source_code ~ '^[A-Z0-9_-]{3,64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pharmacy_dispatch_payments'::regclass
      AND conname = 'pharmacy_dispatch_payments_referral_source_code_format_ck'
  ) THEN
    ALTER TABLE public.pharmacy_dispatch_payments
      ADD CONSTRAINT pharmacy_dispatch_payments_referral_source_code_format_ck
      CHECK (referral_source_code IS NULL OR referral_source_code ~ '^[A-Z0-9_-]{3,64}$');
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_requests_referral_source
  ON public.pharmacy_dispatch_requests (referral_source_code)
  WHERE referral_source_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_payments_referral_source
  ON public.pharmacy_dispatch_payments (referral_source_code)
  WHERE referral_source_code IS NOT NULL;

COMMENT ON COLUMN public.pharmacy_dispatch_requests.referral_source_code IS
  'Non-clinical physical QR/source attribution code. Partner identity remains server-resolved through referral_partner_id.';

COMMENT ON COLUMN public.pharmacy_dispatch_payments.referral_source_code IS
  'Copied from the originating dispatch request for payment-level QR/source reconciliation.';

COMMIT;
