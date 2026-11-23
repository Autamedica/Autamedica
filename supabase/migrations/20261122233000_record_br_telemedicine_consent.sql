-- Preserve an auditable, versioned record of explicit Brazil telemedicine consent.
-- Existing rows are intentionally not backfilled: consent evidence cannot be inferred.
ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS telemedicine_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS telemedicine_consent_version text;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS telemedicine_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS telemedicine_consent_version text;

COMMENT ON COLUMN public.pharmacy_dispatch_requests.telemedicine_consent_at IS
  'Server timestamp of the explicit telemedicine consent for this Brazil pharmacy dispatch; null means no such evidence was captured.';
COMMENT ON COLUMN public.pharmacy_dispatch_requests.telemedicine_consent_version IS
  'Immutable identifier for the exact consent copy accepted for this Brazil pharmacy dispatch.';
COMMENT ON COLUMN public.patients.telemedicine_consent_at IS
  'Latest server timestamp of explicit Brazil telemedicine consent; does not replace encounter-level evidence.';
COMMENT ON COLUMN public.patients.telemedicine_consent_version IS
  'Version identifier of the latest explicit Brazil telemedicine consent copy.';
