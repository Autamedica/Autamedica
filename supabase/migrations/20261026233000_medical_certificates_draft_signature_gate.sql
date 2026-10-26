-- Phase 1: prevent unsigned certificate drafts from being labelled as signed.
-- Deliberately does not relabel existing records; historical rows require manual audit.
ALTER TABLE public.medical_certificates
  ALTER COLUMN status SET DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS signature_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_hash text,
  ADD COLUMN IF NOT EXISTS signature_method text;

-- Existing legacy signed records may not have signature evidence.
-- NOT VALID enforces the gate for NEW inserts/updates without breaking migration
-- on historical documents; do not VALIDATE until old rows have been reviewed.
ALTER TABLE public.medical_certificates
  ADD CONSTRAINT medical_certificates_signed_requires_verified_evidence
  CHECK (
    status <> 'signed'
    OR (
      signed_pdf_url IS NOT NULL
      AND length(btrim(signed_pdf_url)) > 0
      AND signature_verified_at IS NOT NULL
      AND signature_hash IS NOT NULL
      AND length(btrim(signature_hash)) > 0
      AND signature_method IN ('ac_external', 'electronic_verified')
    )
  ) NOT VALID;

-- The Android client has historically inserted rows directly via RLS.
-- It must never be allowed to insert a pre-signed document.
DROP POLICY IF EXISTS "Doctors can insert their own certificates" ON public.medical_certificates;
CREATE POLICY "Doctors can insert their own certificates"
  ON public.medical_certificates FOR INSERT TO authenticated
  WITH CHECK (
    status = 'draft'
    AND doctor_id IN (SELECT id FROM public.doctors WHERE user_id = (SELECT auth.uid()))
  );

-- The authorized signing flow (to be developed) must verify the signature,
-- store immutable evidence, and transition draft -> signed server-side.
