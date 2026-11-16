BEGIN;

-- Bind certificates created during a pharmacy dispatch to the exact clinical
-- encounter that authorized the doctor's access to this patient.
ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS dispatch_request_id uuid
    REFERENCES public.pharmacy_dispatch_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS medical_certificates_dispatch_request_idx
  ON public.medical_certificates(dispatch_request_id)
  WHERE dispatch_request_id IS NOT NULL;

COMMENT ON COLUMN public.medical_certificates.dispatch_request_id IS
  'Optional source encounter for an on-demand pharmacy dispatch certificate.';

COMMIT;
