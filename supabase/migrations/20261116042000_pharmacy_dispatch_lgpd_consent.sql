ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS lgpd_consent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pharmacy_dispatch_requests.lgpd_consent IS
  'Explicit consent accepted during the pharmacy express intake; copied from the submitted consent action.';
