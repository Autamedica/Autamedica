-- Argentine electronic signature: authenticated physician confirmation of an
-- exact snapshot plus uploaded signature/stamp. This is NOT certified PAdES.
-- Historical signed rows are not changed or retrospectively legitimized.
CREATE TABLE IF NOT EXISTS public.medical_certificate_electronic_issuances (
  certificate_id uuid PRIMARY KEY REFERENCES public.medical_certificates(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmed_at timestamptz NOT NULL,
  confirmation_version text NOT NULL DEFAULT 'ar-electronic-v1' CHECK (confirmation_version = 'ar-electronic-v1'),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  pdf_hash text NOT NULL CHECK (pdf_hash ~ '^[a-f0-9]{64}$'),
  signature_image_hash text NOT NULL CHECK (signature_image_hash ~ '^[a-f0-9]{64}$'),
  stamp_image_hash text NOT NULL CHECK (stamp_image_hash ~ '^[a-f0-9]{64}$'),
  pdf_path text NOT NULL,
  doctor_identity jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pdf_path = 'certificates/electronic/' || certificate_id::text || '/' || pdf_hash || '.pdf')
);
ALTER TABLE public.medical_certificate_electronic_issuances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medical_certificate_electronic_issuances FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.medical_certificate_electronic_issuances TO service_role;

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
  SELECT * INTO pp FROM public.profiles WHERE user_id = pat.user_id FOR SHARE;
  IF NOT FOUND OR nullif(btrim(concat_ws(' ',pp.first_name,pp.last_name)),'') IS NULL
     OR nullif(btrim(pat.dni),'') IS NULL OR nullif(btrim(d.license_number),'') IS NULL
     OR nullif(btrim(concat_ws(' ',pr.first_name,pr.last_name)),'') IS NULL
     OR coalesce(nullif(d.signature_image_url,''),nullif(d.signature_url,'')) IS NULL
     OR coalesce(nullif(d.stamp_image_url,''),nullif(d.stamp_url,'')) IS NULL THEN
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
     OR p_expected_patient IS NULL OR NOT (to_jsonb(pat) @> p_expected_patient)
     OR p_expected_patient_profile IS NULL OR NOT (to_jsonb(pp) @> p_expected_patient_profile) THEN
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
REVOKE ALL ON FUNCTION public.issue_electronic_medical_certificate(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_electronic_medical_certificate(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_certificate_electronic_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'signed' AND
     (to_jsonb(NEW) - ARRAY['status','updated_at']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','updated_at']) THEN
    RAISE EXCEPTION 'issued_certificate_immutable';
  END IF;
  IF NEW.status = 'signed' AND NEW.signature_method = 'electronic_verified' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.medical_certificate_electronic_issuances e WHERE e.certificate_id = NEW.id
      AND e.pdf_hash = NEW.signature_hash AND e.pdf_path = NEW.signed_pdf_url
      AND e.confirmed_at = NEW.signature_verified_at
    ) THEN RAISE EXCEPTION 'certificate_confirmation_evidence_missing'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_certificate_electronic_evidence() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_certificate_electronic_evidence ON public.medical_certificates;
CREATE TRIGGER trg_certificate_electronic_evidence BEFORE INSERT OR UPDATE ON public.medical_certificates
  FOR EACH ROW EXECUTE FUNCTION public.guard_certificate_electronic_evidence();

DROP POLICY IF EXISTS certificate_electronic_no_client_update ON storage.objects;
CREATE POLICY certificate_electronic_no_client_update ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (bucket_id <> 'medical-documents' OR name NOT LIKE 'certificates/electronic/%')
  WITH CHECK (bucket_id <> 'medical-documents' OR name NOT LIKE 'certificates/electronic/%');
DROP POLICY IF EXISTS certificate_electronic_no_client_delete ON storage.objects;
CREATE POLICY certificate_electronic_no_client_delete ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated USING (bucket_id <> 'medical-documents' OR name NOT LIKE 'certificates/electronic/%');
DROP POLICY IF EXISTS certificate_electronic_no_client_insert ON storage.objects;
CREATE POLICY certificate_electronic_no_client_insert ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (bucket_id <> 'medical-documents' OR name NOT LIKE 'certificates/electronic/%');
DROP POLICY IF EXISTS certificate_electronic_private_download ON storage.objects;
CREATE POLICY certificate_electronic_private_download ON storage.objects AS RESTRICTIVE
  FOR SELECT TO authenticated USING (bucket_id <> 'medical-documents' OR name NOT LIKE 'certificates/electronic/%');
