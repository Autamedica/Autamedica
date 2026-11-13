-- STAGING-ONLY, NOT PART OF NORMAL PRODUCTION MIGRATION REPLAY.
-- Enables synthetic Jordan dispatch/payment test cases when the dedicated
-- staging Supabase project still lacks the full 2026-11-01 market migration.
-- This does NOT replace the country-pair guard for doctors/patients or full
-- production parity; never infer country from phone, CPF or locale.
ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS care_country text,
  ADD COLUMN IF NOT EXISTS patient_cpf text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.pharmacy_dispatch_requests'::regclass
      AND conname='stg_jordan_explicit_country'
  ) THEN
    ALTER TABLE public.pharmacy_dispatch_requests
      ADD CONSTRAINT stg_jordan_explicit_country
      CHECK (care_country IS NULL OR care_country IN ('AR','BR'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.pharmacy_dispatch_requests'::regclass
      AND conname='stg_jordan_document_market'
  ) THEN
    ALTER TABLE public.pharmacy_dispatch_requests
      ADD CONSTRAINT stg_jordan_document_market
      CHECK (care_country IS NULL OR
            (care_country='BR' AND patient_dni IS NULL AND patient_cpf ~ '^[0-9]{11}$') OR
            (care_country='AR' AND patient_cpf IS NULL AND patient_dni ~ '^[0-9]{5,10}$'));
  END IF;
END $$;
COMMENT ON COLUMN public.pharmacy_dispatch_requests.care_country
  IS 'Explicit country for staged synthetic Jordan tests; full clinical market parity not asserted.';
COMMENT ON COLUMN public.pharmacy_dispatch_requests.patient_cpf
  IS 'Brazilian document field isolated from Argentine DNI in staging test requests.';
