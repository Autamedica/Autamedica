-- REVIEW-ONLY SQL DESIGN. Not an applied Supabase migration.
-- Matches orchestrator states: reserve (pending), authorization, failed, verified.
-- Pending PFDR approval and audited callback workflow.
-- CUIL and request evidence are sensitive: never expose through browser/RLS.
CREATE TABLE IF NOT EXISTS public.doctor_firmar_enrollments (
  doctor_id uuid PRIMARY KEY REFERENCES public.doctors(id) ON DELETE RESTRICT,
  cuil varchar(11) NOT NULL UNIQUE CHECK (cuil ~ '^[0-9]{11}$'),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'revoked')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (verification_status <> 'verified' OR verified_at IS NOT NULL)
);
ALTER TABLE public.doctor_firmar_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.doctor_firmar_enrollments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.doctor_firmar_enrollments TO service_role;

CREATE TABLE IF NOT EXISTS public.medical_certificate_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES public.medical_certificates(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  signer_cuil varchar(11) NOT NULL CHECK (signer_cuil ~ '^[0-9]{11}$'),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  original_pdf_sha256 char(64) NOT NULL CHECK (original_pdf_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'awaiting_doctor_authorization', 'processing', 'verified', 'rejected', 'failed', 'expired')),
  expires_at timestamptz NOT NULL,
  authorization_url text,
  CHECK (authorization_url IS NULL OR left(authorization_url, 8) = 'https://'),
  signed_pdf_sha256 char(64),
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_medical_certificate_pending_signature
  ON public.medical_certificate_signature_requests (certificate_id)
  WHERE status IN ('pending', 'awaiting_doctor_authorization', 'processing');
CREATE INDEX IF NOT EXISTS idx_signature_requests_pending_expiry
  ON public.medical_certificate_signature_requests (expires_at)
  WHERE status IN ('pending', 'awaiting_doctor_authorization', 'processing');
ALTER TABLE public.medical_certificate_signature_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medical_certificate_signature_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.medical_certificate_signature_requests TO service_role;

-- Release gate for final PFDR callback (NOT IMPLEMENTED):
-- 1. Load and lock one pending, unexpired request by SHA-256(token).
-- 2. Independently verify actual PAdES, trust chain, signer identity,
--    OCSP/CRL, immutable signed PDF and correspondence to original snapshot.
-- 3. Write the signed PDF to private storage, retain SHA-256 evidence.
-- 4. Transactionally transition one pending request to verified AND its
--    linked certificate draft to signed. Record audit event, be idempotent.
-- 5. Never treat a browser redirect or callback metadata as a valid signature.
