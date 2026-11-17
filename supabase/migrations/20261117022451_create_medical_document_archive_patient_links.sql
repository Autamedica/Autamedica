CREATE TABLE public.medical_document_archive_patient_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 archive_id uuid NOT NULL UNIQUE REFERENCES public.medical_document_archives(id) ON DELETE RESTRICT,
 patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
 link_method text NOT NULL CHECK (link_method IN ('verified_dni','patient_claim','administrative_review')),
 linked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medical_document_archive_patient_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medical_document_archive_patient_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.medical_document_archive_patient_links TO authenticated;
GRANT SELECT, INSERT ON public.medical_document_archive_patient_links TO service_role;
CREATE POLICY patient_reads_own_archive_links ON public.medical_document_archive_patient_links
 FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.patients p
   WHERE p.id=medical_document_archive_patient_links.patient_id
    AND p.user_id=(SELECT auth.uid()) AND p.active=true)
);
GRANT SELECT ON public.medical_document_archives TO authenticated;
CREATE POLICY patient_reads_linked_medical_document_archive ON public.medical_document_archives
 FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.medical_document_archive_patient_links l
   JOIN public.patients p ON p.id=l.patient_id
   WHERE l.archive_id=medical_document_archives.id
    AND p.user_id=(SELECT auth.uid()) AND p.active=true)
);