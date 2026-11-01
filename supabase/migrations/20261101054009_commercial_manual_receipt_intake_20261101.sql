-- Administrative intake of offline B2C receipts (e.g. manually received PIX).
-- Never assert money was received merely because an admin reported a sale.
-- Deliberately excludes patient IDs, names, diagnoses, CID, documents, notes.
CREATE TABLE IF NOT EXISTS public.commercial_manual_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL CHECK (country_code IN ('BR', 'AR')),
  currency text NOT NULL CHECK (currency IN ('BRL', 'ARS')),
  amount_minor integer NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 100000000),
  channel text NOT NULL CHECK (channel IN ('whatsapp','phone','website','referral','walk_in','other')),
  payment_method text NOT NULL CHECK (payment_method IN ('pix_external','bank_transfer','cash','card_external','other')),
  external_reference text CHECK (external_reference IS NULL OR external_reference ~ '^[A-Za-z0-9_-]{6,128}$'),
  service_category text NOT NULL DEFAULT 'medical_service' CHECK (service_category IN ('medical_service','other')),
  reconciliation_status text NOT NULL DEFAULT 'reported' CHECK (reconciliation_status = 'reported'),
  occurred_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_manual_receipts_country_currency_chk
    CHECK ((country_code='BR' AND currency='BRL') OR (country_code='AR' AND currency='ARS'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_receipt_external_reference
  ON public.commercial_manual_receipts(country_code,payment_method,external_reference)
  WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_manual_receipts_created
  ON public.commercial_manual_receipts(created_at DESC);
COMMENT ON TABLE public.commercial_manual_receipts IS
  'Admin-reported offline transactions, NOT bank-verified revenue. No identifiable or clinical details.';
ALTER TABLE public.commercial_manual_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_manual_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.commercial_manual_receipts TO service_role;
