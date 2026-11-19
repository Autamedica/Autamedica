-- Persist external medical-document PDFs and atomically link an identified patient.
-- Storage upload is performed by the authenticated doctor endpoint; this RPC
-- commits the archive row and optional verified patient link in one transaction.

CREATE OR REPLACE FUNCTION public.register_medical_document_archive(
  p_reference text,
  p_doctor_id uuid,
  p_document_date date,
  p_pdf_sha256 text,
  p_issuer_snapshot jsonb,
  p_patient_snapshot jsonb,
  p_clinical_snapshot jsonb,
  p_authorization_snapshot jsonb,
  p_signature_image_sha256 text,
  p_stamp_image_sha256 text,
  p_patient_id uuid DEFAULT NULL,
  p_patient_document_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_archive_id uuid;
  v_patient public.patients%ROWTYPE;
  v_patient_document text;
  v_submitted_document text;
BEGIN
  IF p_patient_id IS NOT NULL THEN
    SELECT * INTO v_patient
    FROM public.patients
    WHERE id = p_patient_id
      AND active IS TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'medical_document_archive_patient_not_found';
    END IF;

    v_patient_document := CASE v_patient.care_country
      WHEN 'AR' THEN coalesce(v_patient.dni, '')
      WHEN 'BR' THEN coalesce(v_patient.cpf, '')
      ELSE ''
    END;
    v_submitted_document := regexp_replace(coalesce(p_patient_document_number, ''), '[^0-9]', '', 'g');

    IF v_patient.care_country NOT IN ('AR', 'BR')
       OR v_submitted_document = ''
       OR regexp_replace(v_patient_document, '[^0-9]', '', 'g') <> v_submitted_document THEN
      RAISE EXCEPTION 'medical_document_archive_patient_identity_mismatch';
    END IF;
  ELSIF p_patient_document_number IS NOT NULL THEN
    RAISE EXCEPTION 'medical_document_archive_patient_link_requires_patient_id';
  END IF;

  INSERT INTO public.medical_document_archives (
    reference,
    doctor_id,
    document_date,
    status,
    signature_type,
    pdf_sha256,
    issuer_snapshot,
    patient_snapshot,
    clinical_snapshot,
    authorization_snapshot,
    signature_image_sha256,
    stamp_image_sha256
  ) VALUES (
    p_reference,
    p_doctor_id,
    p_document_date,
    'registered',
    'scanned_signature',
    p_pdf_sha256,
    p_issuer_snapshot,
    p_patient_snapshot,
    p_clinical_snapshot,
    p_authorization_snapshot,
    p_signature_image_sha256,
    p_stamp_image_sha256
  )
  RETURNING id INTO v_archive_id;

  IF p_patient_id IS NOT NULL THEN
    INSERT INTO public.medical_document_archive_patient_links (
      archive_id,
      patient_id,
      link_method
    ) VALUES (
      v_archive_id,
      p_patient_id,
      'verified_dni'
    );
  END IF;

  RETURN v_archive_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_medical_document_archive(
  text, uuid, date, text, jsonb, jsonb, jsonb, jsonb, text, text, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_medical_document_archive(
  text, uuid, date, text, jsonb, jsonb, jsonb, jsonb, text, text, uuid, text
) TO service_role;
