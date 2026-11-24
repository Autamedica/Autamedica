-- Patient self-uploaded clinical documents inbox (ERR-01).
-- Keeps public.medical_records strictly clinician/admin-write-only while giving
-- authenticated patients a validated, ownership-scoped path to upload studies and documents.
BEGIN;

CREATE TABLE IF NOT EXISTS public.patient_document_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  document_type text NOT NULL DEFAULT 'other' CHECK (document_type IN ('lab_result', 'imaging', 'prescription', 'report', 'other')),
  storage_bucket text NOT NULL DEFAULT 'medical-documents' CHECK (storage_bucket = 'medical-documents'),
  storage_path text NOT NULL CHECK (storage_path LIKE uploaded_by_user_id::text || '/%'),
  file_name text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
  review_status text NOT NULL DEFAULT 'submitted' CHECK (review_status IN ('submitted', 'reviewed', 'archived')),
  reviewed_by_doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_patient_document_submissions_patient_created
  ON public.patient_document_submissions (patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_document_submissions_uploader
  ON public.patient_document_submissions (uploaded_by_user_id);

ALTER TABLE public.patient_document_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.patient_document_submissions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.patient_document_submissions TO authenticated;
GRANT ALL ON TABLE public.patient_document_submissions TO service_role;

DROP POLICY IF EXISTS patient_doc_submissions_select_own ON public.patient_document_submissions;
CREATE POLICY patient_doc_submissions_select_own
  ON public.patient_document_submissions
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_document_submissions.patient_id
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS patient_doc_submissions_select_doctor ON public.patient_document_submissions;
CREATE POLICY patient_doc_submissions_select_doctor
  ON public.patient_document_submissions
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.is_clinically_approved_doctor())
    AND public.doctor_has_patient_access_by_id(patient_document_submissions.patient_id)
  );

DROP POLICY IF EXISTS patient_doc_submissions_select_admin ON public.patient_document_submissions;
CREATE POLICY patient_doc_submissions_select_admin
  ON public.patient_document_submissions
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_system_admin()));

DROP POLICY IF EXISTS patient_doc_submissions_insert_own ON public.patient_document_submissions;
CREATE POLICY patient_doc_submissions_insert_own
  ON public.patient_document_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND uploaded_by_user_id = (SELECT auth.uid())
    AND review_status = 'submitted'
    AND reviewed_by_doctor_id IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_document_submissions.patient_id
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS patient_doc_submissions_update_own ON public.patient_document_submissions;
CREATE POLICY patient_doc_submissions_update_own
  ON public.patient_document_submissions
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND uploaded_by_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_document_submissions.patient_id
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  )
  WITH CHECK (
    uploaded_by_user_id = (SELECT auth.uid())
    AND review_status = 'submitted'
    AND reviewed_by_doctor_id IS NULL
    AND reviewed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_document_submissions.patient_id
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS patient_doc_submissions_service_role ON public.patient_document_submissions;
CREATE POLICY patient_doc_submissions_service_role
  ON public.patient_document_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
