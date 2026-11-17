-- Link previously archived documents to authenticated patient accounts without mutating the immutable archive.
CREATE TABLE IF NOT EXISTS public.medical_document_archive_patient_links (
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

CREATE POLICY patient_reads_own_archive_links
ON public.medical_document_archive_patient_links
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = medical_document_archive_patient_links.patient_id
      AND p.user_id = (SELECT auth.uid())
      AND p.active = true
  )
);

GRANT SELECT ON public.medical_document_archives TO authenticated;
CREATE POLICY patient_reads_linked_medical_document_archive
ON public.medical_document_archives
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.medical_document_archive_patient_links l
    JOIN public.patients p ON p.id = l.patient_id
    WHERE l.archive_id = medical_document_archives.id
      AND p.user_id = (SELECT auth.uid())
      AND p.active = true
  )
);

COMMENT ON TABLE public.medical_document_archive_patient_links IS
  'Append-only association between an immutable archived medical document and its verified patient account. Does not alter or certify the archived document.';

-- Retroactive association: exact DNI match in the immutable patient snapshot and confirmed patient account.
INSERT INTO public.medical_document_archive_patient_links (archive_id, patient_id, link_method)
SELECT a.id, p.id, 'verified_dni'
FROM public.medical_document_archives a
JOIN public.patients p ON p.user_id = (
  SELECT u.id FROM auth.users u WHERE lower(u.email) = lower('ddutraeducar@gmail.com') AND u.email_confirmed_at IS NOT NULL
)
WHERE a.reference = 'DOC-A5CF3BF35A9F6F36A8F261A1F8E064F1'
  AND regexp_replace(a.patient_snapshot->>'document_number', '[^0-9]', '', 'g') = '96032372'
  AND lower(a.patient_snapshot->>'name') = lower('Guilherme Dutra de Almeida')
  AND p.active = true
ON CONFLICT (archive_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.medical_document_archive_patient_links l
    JOIN public.medical_document_archives a ON a.id = l.archive_id
    JOIN public.patients p ON p.id = l.patient_id
    JOIN auth.users u ON u.id = p.user_id
    WHERE a.reference = 'DOC-A5CF3BF35A9F6F36A8F261A1F8E064F1'
      AND l.link_method = 'verified_dni'
      AND lower(u.email) = lower('ddutraeducar@gmail.com')
  ) THEN
    RAISE EXCEPTION 'verified_patient_archive_link_not_created';
  END IF;
END $$;
