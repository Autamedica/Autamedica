-- Private archive of externally prepared clinical documents. An archive entry
-- records administrative custody and file integrity, NOT a verified signature.
-- No patient account, platform appointment, or physician impersonation is needed.
CREATE TABLE IF NOT EXISTS public.medical_document_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE CHECK (reference ~ '^DOC-[A-F0-9]{32}$' AND length(reference)=36),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  document_date date NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered','revoked')),
  signature_type text NOT NULL CHECK (signature_type='scanned_signature'),
  pdf_sha256 text NOT NULL UNIQUE CHECK (pdf_sha256 ~ '^[a-f0-9]{64}$' AND length(pdf_sha256)=64),
  issuer_snapshot jsonb NOT NULL CHECK (jsonb_typeof(issuer_snapshot)='object'
    AND length(btrim(coalesce(issuer_snapshot->>'name','')))>0
    AND length(btrim(coalesce(issuer_snapshot->>'profession','')))>0
    AND length(btrim(coalesce(issuer_snapshot->>'license','')))>0
    AND length(btrim(coalesce(issuer_snapshot->>'jurisdiction','')))>0),
  patient_snapshot jsonb NOT NULL CHECK (jsonb_typeof(patient_snapshot)='object'
    AND length(btrim(coalesce(patient_snapshot->>'name','')))>0
    AND length(btrim(coalesce(patient_snapshot->>'document_number','')))>0),
  clinical_snapshot jsonb NOT NULL CHECK (jsonb_typeof(clinical_snapshot)='object'),
  authorization_snapshot jsonb NOT NULL CHECK (jsonb_typeof(authorization_snapshot)='object'
    AND coalesce(authorization_snapshot->>'source','')='physician_authorization_reported_by_operator'
    AND length(btrim(coalesce(authorization_snapshot->>'statement','')))>0),
  signature_image_sha256 text NOT NULL CHECK (signature_image_sha256 ~ '^[a-f0-9]{64}$'),
  stamp_image_sha256 text NOT NULL CHECK (stamp_image_sha256 ~ '^[a-f0-9]{64}$')
);
ALTER TABLE public.medical_document_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medical_document_archives FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.medical_document_archives TO service_role;
GRANT UPDATE(status) ON public.medical_document_archives TO service_role;

CREATE OR REPLACE FUNCTION public.guard_medical_document_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'document_archive_append_only'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')
       OR OLD.status='revoked' OR NEW.status<>'revoked' THEN
      RAISE EXCEPTION 'document_archive_immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_medical_document_archive() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_guard_medical_document_archive ON public.medical_document_archives;
CREATE TRIGGER trg_guard_medical_document_archive BEFORE UPDATE OR DELETE ON public.medical_document_archives
  FOR EACH ROW EXECUTE FUNCTION public.guard_medical_document_archive();
COMMENT ON TABLE public.medical_document_archives IS
  'Private administrative archive. Public verification must explicitly project non-clinical fields; registration does not certify a cryptographic physician signature.';
