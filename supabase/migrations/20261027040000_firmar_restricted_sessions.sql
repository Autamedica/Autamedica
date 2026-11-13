-- PFDR preparation: new restricted tables only. Does not authorize or enable signing.
-- Generated against the production doctors / medical_certificates schema.
CREATE TABLE IF NOT EXISTS public.doctor_firmar_enrollments (
  doctor_id uuid PRIMARY KEY REFERENCES public.doctors(id) ON DELETE RESTRICT,
  cuil varchar(11) NOT NULL UNIQUE CHECK (cuil ~ '^[0-9]{11}$'),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected','revoked')),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firmar_verified_doctor_requires_timestamp
    CHECK (verification_status <> 'verified' OR verified_at IS NOT NULL)
);
ALTER TABLE public.doctor_firmar_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.doctor_firmar_enrollments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.doctor_firmar_enrollments TO service_role;

CREATE TABLE IF NOT EXISTS public.medical_certificate_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES public.medical_certificates(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  signer_cuil varchar(11) NOT NULL CHECK (signer_cuil ~ '^[0-9]{11}$'),
  token_hash varchar(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  original_pdf_sha256 varchar(64) NOT NULL CHECK (original_pdf_sha256 ~ '^[a-f0-9]{64}$'),
  original_pdf_path text NOT NULL CHECK (original_pdf_path LIKE 'certificates/firmar/source/%'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','awaiting_doctor_authorization','processing','verified','rejected','failed','expired')),
  authorization_url text,
  signed_pdf_sha256 varchar(64) CHECK (signed_pdf_sha256 IS NULL OR signed_pdf_sha256 ~ '^[a-f0-9]{64}$'),
  signed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firmar_authorization_url_https CHECK (
    authorization_url IS NULL OR left(authorization_url, 8) = 'https://'
  ),
  CONSTRAINT firmar_final_signature_requires_evidence CHECK (
    status <> 'verified' OR (signed_pdf_sha256 IS NOT NULL AND signed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS firmar_one_open_request_per_certificate
  ON public.medical_certificate_signature_requests(certificate_id)
  WHERE status IN ('pending','awaiting_doctor_authorization','processing');
CREATE INDEX IF NOT EXISTS firmar_request_expiry_idx
  ON public.medical_certificate_signature_requests(expires_at)
  WHERE status IN ('pending','awaiting_doctor_authorization','processing');
ALTER TABLE public.medical_certificate_signature_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.medical_certificate_signature_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.medical_certificate_signature_requests TO service_role;

-- The RPC is only callable with a privileged, server-side service key.
-- An advisory lock on the certificate row prevents competing reservations.
CREATE OR REPLACE FUNCTION public.firmar_reserve_certificate_signature(
  p_certificate_id uuid,
  p_doctor_id uuid,
  p_signer_cuil text,
  p_token_hash text,
  p_original_pdf_sha256 text,
  p_original_pdf_path text,
  p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_certificate record;
  v_enrollment record;
  v_request_id uuid;
BEGIN
  SELECT id, doctor_id, status, country_code
  INTO v_certificate
  FROM public.medical_certificates
  WHERE id = p_certificate_id
  FOR UPDATE;

  IF NOT FOUND OR v_certificate.doctor_id IS DISTINCT FROM p_doctor_id
    OR v_certificate.status <> 'draft' OR v_certificate.country_code <> 'AR' THEN
    RAISE EXCEPTION 'firmar_certificate_not_signable';
  END IF;

  SELECT cuil, verification_status INTO v_enrollment
  FROM public.doctor_firmar_enrollments
  WHERE doctor_id = p_doctor_id;

  IF NOT FOUND OR v_enrollment.verification_status <> 'verified'
     OR v_enrollment.cuil IS DISTINCT FROM p_signer_cuil THEN
    RAISE EXCEPTION 'firmar_doctor_not_enrolled';
  END IF;

  IF p_expires_at <= now() OR p_expires_at > now() + interval '15 minutes'
     OR p_token_hash !~ '^[a-f0-9]{64}$'
     OR p_original_pdf_sha256 !~ '^[a-f0-9]{64}$'
     OR p_original_pdf_path NOT LIKE 'certificates/firmar/source/%'
     OR length(p_original_pdf_path) > 250 THEN
    RAISE EXCEPTION 'firmar_reservation_invalid';
  END IF;

  UPDATE public.medical_certificate_signature_requests
  SET status = 'expired', updated_at = now()
  WHERE certificate_id = p_certificate_id
    AND expires_at < now()
    AND status IN ('pending','awaiting_doctor_authorization','processing');

  INSERT INTO public.medical_certificate_signature_requests (
    certificate_id, doctor_id, signer_cuil, token_hash,
    original_pdf_sha256, original_pdf_path, status, expires_at
  ) VALUES (
    p_certificate_id, p_doctor_id, p_signer_cuil, p_token_hash,
    p_original_pdf_sha256, p_original_pdf_path, 'pending', p_expires_at
  )
  RETURNING id INTO v_request_id;
  RETURN v_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.firmar_reserve_certificate_signature(
  uuid,uuid,text,text,text,text,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.firmar_reserve_certificate_signature(
  uuid,uuid,text,text,text,text,timestamptz
) TO service_role;

-- The existing certificate signature-verification migration is a separate PR
-- prerequisite. No unsigned document is transitioned to signed here.
