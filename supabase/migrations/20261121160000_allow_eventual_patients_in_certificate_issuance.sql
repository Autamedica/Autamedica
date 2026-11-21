BEGIN;

-- Allow electronic certificate issuance for doctor-created eventual patients
-- (where patients.user_id IS NULL and clinical identity lives in patient_private_identities).
CREATE OR REPLACE FUNCTION public.issue_electronic_medical_certificate(
  p_certificate_id uuid, p_actor_user_id uuid,
  p_expected_certificate jsonb, p_expected_doctor jsonb, p_expected_profile jsonb,
  p_expected_patient jsonb, p_expected_patient_profile jsonb,
  p_snapshot_hash text, p_pdf_hash text, p_signature_hash text, p_stamp_hash text,
  p_confirmed_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  c public.medical_certificates%ROWTYPE;
  d public.doctors%ROWTYPE;
  pr public.profiles%ROWTYPE;
  pat public.patients%ROWTYPE;
  pp public.profiles%ROWTYPE;
  pi public.patient_private_identities%ROWTYPE;
  v_patient_full_name text;
  v_patient_dni text;
  v_expected_patient_compare jsonb;
  v_expected_profile_compare jsonb;
  path text;
BEGIN
  SELECT * INTO c FROM public.medical_certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'certificate_missing'; END IF;
  SELECT * INTO d FROM public.doctors WHERE id = c.doctor_id FOR SHARE;
  IF NOT FOUND OR d.user_id IS DISTINCT FROM p_actor_user_id THEN RAISE EXCEPTION 'certificate_not_owned'; END IF;
  IF c.status = 'signed' AND EXISTS (
    SELECT 1 FROM public.medical_certificate_electronic_issuances e
    WHERE e.certificate_id = c.id AND e.actor_user_id = p_actor_user_id
  ) THEN RETURN to_jsonb(c); END IF;
  IF c.status <> 'draft' OR c.country_code <> 'AR' OR d.license_type NOT IN ('MN','MP') OR d.active IS NOT TRUE THEN
    RAISE EXCEPTION 'certificate_not_eligible';
  END IF;
  SELECT * INTO pr FROM public.profiles WHERE user_id = p_actor_user_id FOR SHARE;
  IF NOT FOUND OR pr.role::text <> 'doctor' OR pr.active IS NOT TRUE OR pr.deleted_at IS NOT NULL
     OR pr.sss_validation_status IS DISTINCT FROM 'valid' THEN
    RAISE EXCEPTION 'certificate_doctor_not_validated';
  END IF;
  SELECT * INTO pat FROM public.patients WHERE id = c.patient_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'certificate_patient_missing'; END IF;

  IF pat.user_id IS NOT NULL THEN
    SELECT * INTO pp FROM public.profiles WHERE user_id = pat.user_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'certificate_identity_or_assets_incomplete';
    END IF;
    v_patient_full_name := btrim(concat_ws(' ', pp.first_name, pp.last_name));
    v_patient_dni := btrim(coalesce(pat.dni, ''));
    v_expected_patient_compare := to_jsonb(pat);
    v_expected_profile_compare := to_jsonb(pp);
  ELSE
    SELECT * INTO pi FROM public.patient_private_identities
      WHERE patient_id = pat.id AND doctor_id = d.id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'certificate_identity_or_assets_incomplete';
    END IF;
    v_patient_full_name := btrim(coalesce(pi.full_name, ''));
    v_patient_dni := btrim(coalesce(pat.dni, pi.document_number, ''));
    v_expected_patient_compare := to_jsonb(pat) || jsonb_build_object('dni', v_patient_dni);
    v_expected_profile_compare := jsonb_build_object('user_id', null, 'first_name', pi.full_name, 'last_name', '');
  END IF;

  IF nullif(v_patient_full_name, '') IS NULL
     OR nullif(v_patient_dni, '') IS NULL
     OR nullif(btrim(d.license_number), '') IS NULL
     OR nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '') IS NULL
     OR coalesce(nullif(d.signature_image_url, ''), nullif(d.signature_url, '')) IS NULL
     OR coalesce(nullif(d.stamp_image_url, ''), nullif(d.stamp_url, '')) IS NULL THEN
    RAISE EXCEPTION 'certificate_identity_or_assets_incomplete';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.patient_care_team t WHERE t.doctor_id = d.id AND t.patient_id = pat.id AND t.active)
     AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.doctor_id = d.id AND a.patient_id = pat.id) THEN
    RAISE EXCEPTION 'certificate_patient_access_denied';
  END IF;
  IF c.appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments a WHERE a.id = c.appointment_id AND a.doctor_id = d.id AND a.patient_id = pat.id
  ) THEN RAISE EXCEPTION 'certificate_appointment_mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM public.medical_certificate_signature_requests r WHERE r.certificate_id = c.id
    AND r.status IN ('pending','awaiting_doctor_authorization','processing') AND r.expires_at > now()) THEN
    RAISE EXCEPTION 'certificate_remote_signing_in_progress';
  END IF;
  IF p_expected_certificate IS DISTINCT FROM to_jsonb(c)
     OR p_expected_doctor IS NULL OR NOT (to_jsonb(d) @> p_expected_doctor)
     OR p_expected_profile IS NULL OR NOT (to_jsonb(pr) @> p_expected_profile)
     OR p_expected_patient IS NULL OR NOT (v_expected_patient_compare @> p_expected_patient)
     OR p_expected_patient_profile IS NULL OR NOT (v_expected_profile_compare @> p_expected_patient_profile) THEN
    RAISE EXCEPTION 'certificate_snapshot_changed';
  END IF;
  IF c.days_of_rest < 0 OR c.days_of_rest > 365 OR (c.days_of_rest > 0 AND (
    c.end_date IS DISTINCT FROM c.start_date + c.days_of_rest - 1 OR nullif(btrim(c.diagnosis),'') IS NULL
  )) THEN RAISE EXCEPTION 'certificate_period_invalid'; END IF;
  IF coalesce(p_snapshot_hash,'') !~ '^[a-f0-9]{64}$' OR coalesce(p_pdf_hash,'') !~ '^[a-f0-9]{64}$'
     OR coalesce(p_signature_hash,'') !~ '^[a-f0-9]{64}$' OR coalesce(p_stamp_hash,'') !~ '^[a-f0-9]{64}$'
     OR p_confirmed_at IS NULL OR p_confirmed_at < now() - interval '5 minutes'
     OR p_confirmed_at > now() + interval '1 minute' THEN RAISE EXCEPTION 'certificate_evidence_invalid'; END IF;
  path := 'certificates/electronic/' || c.id::text || '/' || p_pdf_hash || '.pdf';
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'medical-documents' AND name = path) THEN
    RAISE EXCEPTION 'certificate_pdf_missing';
  END IF;
  INSERT INTO public.medical_certificate_electronic_issuances (
    certificate_id,actor_user_id,confirmed_at,snapshot_hash,pdf_hash,signature_image_hash,stamp_image_hash,pdf_path,doctor_identity
  ) VALUES (c.id,p_actor_user_id,p_confirmed_at,p_snapshot_hash,p_pdf_hash,p_signature_hash,p_stamp_hash,path,
    jsonb_build_object('name',concat_ws(' ',pr.first_name,pr.last_name),'license',d.license_number,'license_type',d.license_type));
  UPDATE public.medical_certificates SET status = 'signed', signature_method = 'electronic_verified',
    signature_hash = p_pdf_hash, signed_pdf_url = path, signature_verified_at = p_confirmed_at, updated_at = now()
    WHERE id = c.id RETURNING * INTO c;
  RETURN to_jsonb(c);
END;
$$;

COMMIT;
