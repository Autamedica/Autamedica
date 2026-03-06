BEGIN;

ALTER TABLE public.anamnesis
  DROP CONSTRAINT IF EXISTS anamnesis_status_check;

ALTER TABLE public.anamnesis
  ADD CONSTRAINT anamnesis_status_check
  CHECK (
    status IN (
      'draft',
      'not_started',
      'in_progress',
      'completed',
      'under_review',
      'approved'
    )
  );

DROP POLICY IF EXISTS "patient_update_anamnesis" ON public.anamnesis;
CREATE POLICY "patient_update_anamnesis" ON public.anamnesis
FOR UPDATE
USING (
  auth.uid() = patient_id
  AND deleted_at IS NULL
  AND NOT locked
  AND COALESCE(status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
)
WITH CHECK (
  auth.uid() = patient_id
  AND deleted_at IS NULL
  AND COALESCE(status, 'in_progress') IN (
    'draft',
    'not_started',
    'in_progress',
    'completed',
    'under_review',
    'approved'
  )
);

DROP POLICY IF EXISTS "patient_upsert_anamnesis_sections" ON public.anamnesis_sections;
CREATE POLICY "patient_upsert_anamnesis_sections" ON public.anamnesis_sections
USING (
  EXISTS (
    SELECT 1
    FROM public.anamnesis a
    WHERE a.id = anamnesis_sections.anamnesis_id
      AND a.patient_id = auth.uid()
      AND a.deleted_at IS NULL
      AND NOT a.locked
      AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.anamnesis a
    WHERE a.id = anamnesis_sections.anamnesis_id
      AND a.patient_id = auth.uid()
      AND a.deleted_at IS NULL
      AND NOT a.locked
      AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
  )
);

COMMIT;
