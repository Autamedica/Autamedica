BEGIN;

DROP POLICY IF EXISTS patient_insert_anamnesis ON public.anamnesis;
CREATE POLICY patient_insert_anamnesis
  ON public.anamnesis FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = anamnesis.patient_id
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS patient_select_anamnesis ON public.anamnesis;
CREATE POLICY patient_select_anamnesis
  ON public.anamnesis FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = anamnesis.patient_id
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS patient_update_anamnesis ON public.anamnesis;
CREATE POLICY patient_update_anamnesis
  ON public.anamnesis FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND NOT locked
    AND COALESCE(status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = anamnesis.patient_id
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND COALESCE(status, 'in_progress') IN ('draft', 'not_started', 'in_progress', 'completed', 'under_review', 'approved')
    AND EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = anamnesis.patient_id
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS anamnesis_sections_select_patient ON public.anamnesis_sections;
CREATE POLICY anamnesis_sections_select_patient
  ON public.anamnesis_sections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      JOIN public.patients p ON p.id = a.patient_id
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.deleted_at IS NULL
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS anamnesis_sections_insert_patient ON public.anamnesis_sections;
DROP POLICY IF EXISTS patient_upsert_anamnesis_sections ON public.anamnesis_sections;
CREATE POLICY anamnesis_sections_insert_patient
  ON public.anamnesis_sections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      JOIN public.patients p ON p.id = a.patient_id
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.deleted_at IS NULL
        AND NOT a.locked
        AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS anamnesis_sections_update_patient ON public.anamnesis_sections;
CREATE POLICY anamnesis_sections_update_patient
  ON public.anamnesis_sections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      JOIN public.patients p ON p.id = a.patient_id
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.deleted_at IS NULL
        AND NOT a.locked
        AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      JOIN public.patients p ON p.id = a.patient_id
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.deleted_at IS NULL
        AND NOT a.locked
        AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

DROP POLICY IF EXISTS anamnesis_sections_delete_patient ON public.anamnesis_sections;
CREATE POLICY anamnesis_sections_delete_patient
  ON public.anamnesis_sections FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      JOIN public.patients p ON p.id = a.patient_id
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.deleted_at IS NULL
        AND NOT a.locked
        AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
        AND p.user_id = (SELECT auth.uid())
        AND p.active IS TRUE
    )
  );

CREATE OR REPLACE FUNCTION public.patient_submit_followup_checkin(
  p_followup_id uuid,
  p_evolution text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_responded_at timestamptz := pg_catalog.now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_evolution IS NULL OR p_evolution NOT IN ('better', 'stable', 'worse') THEN
    RAISE EXCEPTION 'invalid_followup_evolution' USING ERRCODE = '22023';
  END IF;

  IF p_notes IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_notes)) > 500 THEN
    RAISE EXCEPTION 'followup_notes_too_long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointment_followups AS f
  SET
    metadata = COALESCE(f.metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
      'response', p_evolution,
      'evolution', p_evolution,
      'responded_at', v_responded_at,
      'notes', NULLIF(pg_catalog.btrim(p_notes), '')
    ),
    updated_at = v_responded_at
  WHERE f.id = p_followup_id
    AND f.status IN ('pending', 'sent')
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = f.patient_id
        AND p.user_id = auth.uid()
        AND p.active IS TRUE
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'followup_not_owned_or_not_open' USING ERRCODE = '42501';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', TRUE,
    'followup_id', p_followup_id,
    'responded_at', v_responded_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.patient_submit_followup_checkin(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_submit_followup_checkin(uuid, text, text) TO authenticated;

COMMIT;
