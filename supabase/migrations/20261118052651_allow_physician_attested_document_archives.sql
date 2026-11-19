-- An authenticated physician may archive a final PDF they issued outside AutaMedica.
-- The recipient-facing verifier remains read-only. The PDF bytes are hashed in
-- the request and are not retained by this table or uploaded to object storage.
ALTER TABLE public.medical_document_archives
  DROP CONSTRAINT IF EXISTS medical_document_archives_authorization_snapshot_check;

ALTER TABLE public.medical_document_archives
  ADD CONSTRAINT medical_document_archives_authorization_snapshot_check
  CHECK (
    jsonb_typeof(authorization_snapshot)='object'
    AND coalesce(authorization_snapshot->>'source','') IN (
      'physician_authorization_reported_by_operator',
      'physician_attested_upload'
    )
    AND length(btrim(coalesce(authorization_snapshot->>'statement','')))>0
  );

COMMENT ON COLUMN public.medical_document_archives.authorization_snapshot IS
  'Private issuer-attestation evidence. Public verification never exposes this snapshot.';
