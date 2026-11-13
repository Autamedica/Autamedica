-- Infrastructure only: RPC is restricted to service_role and MUST NOT be called
-- before independent PAdES signature verification of the exact signed PDF.
-- This migration does not mark any historical certificate signed.
ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS signature_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_hash text,
  ADD COLUMN IF NOT EXISTS signature_method text,
  ADD COLUMN IF NOT EXISTS treatment text;

ALTER TABLE public.medical_certificate_signature_requests
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS certificate_fingerprint_sha256 varchar(64)
    CHECK (certificate_fingerprint_sha256 IS NULL OR certificate_fingerprint_sha256 ~ '^[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION public.firmar_finalize_verified_signature(
  p_request_id uuid,
  p_signed_pdf_sha256 text,
  p_signed_pdf_path text,
  p_signed_at timestamptz,
  p_certificate_fingerprint_sha256 text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request record;
  v_certificate record;
BEGIN
  SELECT * INTO v_request FROM public.medical_certificate_signature_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'firmar_session_missing'; END IF;

  IF p_signed_pdf_sha256 !~ '^[a-f0-9]{64}$'
    OR p_certificate_fingerprint_sha256 !~ '^[a-f0-9]{64}$'
    OR p_signed_pdf_path <> 'certificates/signed/' || v_request.certificate_id::text || '.pdf'
    OR p_signed_at IS NULL OR p_signed_at > now() + interval '10 minutes'
    OR p_signed_at < v_request.created_at - interval '10 minutes' THEN
    RAISE EXCEPTION 'firmar_verified_evidence_invalid';
  END IF;

  IF v_request.status = 'verified' THEN
    RETURN (
      v_request.signed_pdf_sha256 = p_signed_pdf_sha256 AND
      v_request.certificate_fingerprint_sha256 = p_certificate_fingerprint_sha256
    );
  END IF;
  IF v_request.status <> 'awaiting_doctor_authorization'
    OR v_request.expires_at <= now() THEN
    RAISE EXCEPTION 'firmar_session_not_eligible';
  END IF;

  SELECT id, doctor_id, status INTO v_certificate
  FROM public.medical_certificates
  WHERE id = v_request.certificate_id FOR UPDATE;
  IF NOT FOUND OR v_certificate.status <> 'draft'
     OR v_certificate.doctor_id <> v_request.doctor_id THEN
    RAISE EXCEPTION 'firmar_certificate_changed';
  END IF;

  -- The caller has independently validated the full CMS/PAdES chain,
  -- issuer, signer CUIL, revocation, signed bytes and draft correlation.
  -- Service role function permissions are the final trust boundary.
  UPDATE public.medical_certificate_signature_requests SET
    status = 'verified', signed_pdf_sha256 = p_signed_pdf_sha256,
    signed_at = p_signed_at, verified_at = now(),
    certificate_fingerprint_sha256 = p_certificate_fingerprint_sha256,
    updated_at = now()
  WHERE id = p_request_id;

  UPDATE public.medical_certificates SET
    status = 'signed',
    signed_pdf_url = p_signed_pdf_path,
    signature_hash = p_signed_pdf_sha256,
    signature_verified_at = now(),
    signature_method = 'ac_external',
    updated_at = now()
  WHERE id = v_request.certificate_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.firmar_finalize_verified_signature(
  uuid,text,text,timestamptz,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.firmar_finalize_verified_signature(
  uuid,text,text,timestamptz,text
) TO service_role;
