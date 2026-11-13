-- Optional Brazilian CID-10 on medical certificates, only at the patient's
-- express request. No existing certificate or signature is modified.
-- CFM 2.381/2024, art. 5, §§3-4.
ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS cid10_code text,
  ADD COLUMN IF NOT EXISTS cid_requested_by_patient boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cid_consent_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS cid_consent_recorded_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.medical_certificates.cid10_code IS
  'Brazilian CID-10 code disclosed only when explicitly requested by patient; private clinical diagnosis remains separate.';
COMMENT ON COLUMN public.medical_certificates.cid_requested_by_patient IS
  'Attestation by issuing physician of patient or legal representative express request; must reflect real clinical record.';
COMMENT ON COLUMN public.medical_certificates.cid_consent_recorded_by IS
  'Authenticated physician who recorded the patient express request.';

ALTER TABLE public.medical_certificates
  ADD CONSTRAINT medical_certificates_br_cid_patient_request_chk
  CHECK (
    (
      cid10_code IS NULL
      AND cid_requested_by_patient = false
      AND cid_consent_recorded_at IS NULL
      AND cid_consent_recorded_by IS NULL
    )
    OR (
      country_code = 'BR'
      AND cid10_code ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$'
      AND cid_requested_by_patient = true
      AND cid_consent_recorded_at IS NOT NULL
      AND cid_consent_recorded_by IS NOT NULL
      AND hide_diagnosis = true
    )
  );

-- Don't permit post-issuance changes to CID/consent evidence. The signed PDF
-- and clinical snapshot must remain consistent.
CREATE OR REPLACE FUNCTION public.br_cid_preserve_signed_certificate()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status = 'signed'
     AND (
       NEW.cid10_code IS DISTINCT FROM OLD.cid10_code
       OR NEW.cid_requested_by_patient IS DISTINCT FROM OLD.cid_requested_by_patient
       OR NEW.cid_consent_recorded_at IS DISTINCT FROM OLD.cid_consent_recorded_at
       OR NEW.cid_consent_recorded_by IS DISTINCT FROM OLD.cid_consent_recorded_by
     )
  THEN
    RAISE EXCEPTION 'signed_certificate_cid_immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.br_cid_preserve_signed_certificate() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_br_cid_preserve_signed_certificate ON public.medical_certificates;
CREATE TRIGGER trg_br_cid_preserve_signed_certificate
BEFORE UPDATE ON public.medical_certificates
FOR EACH ROW EXECUTE FUNCTION public.br_cid_preserve_signed_certificate();
