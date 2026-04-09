CREATE TABLE IF NOT EXISTS public.psychiatry_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'under_review'::text, 'approved'::text])),
  treatment_context text NOT NULL DEFAULT 'tdah_stimulants',
  completion_percentage integer NOT NULL DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  last_phase text NOT NULL DEFAULT 'wizard_intake' CHECK (last_phase = ANY (ARRAY['wizard_intake'::text, 'conversational_symptoms'::text, 'wizard_safety'::text, 'conversational_closure'::text, 'completed'::text])),
  sections_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked boolean NOT NULL DEFAULT false,
  privacy_accepted boolean NOT NULL DEFAULT false,
  terms_accepted boolean NOT NULL DEFAULT false,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (patient_id)
);

CREATE TABLE IF NOT EXISTS public.psychiatry_intake_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES public.psychiatry_intakes(id) ON DELETE CASCADE,
  section text NOT NULL,
  phase text NOT NULL CHECK (phase = ANY (ARRAY['wizard_intake'::text, 'conversational_symptoms'::text, 'wizard_safety'::text, 'conversational_closure'::text])),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intake_id, section)
);

CREATE INDEX IF NOT EXISTS idx_psychiatry_intakes_patient ON public.psychiatry_intakes(patient_id);
CREATE INDEX IF NOT EXISTS idx_psychiatry_intake_sections_intake ON public.psychiatry_intake_sections(intake_id);
CREATE INDEX IF NOT EXISTS idx_psychiatry_intake_sections_phase ON public.psychiatry_intake_sections(phase);

ALTER TABLE public.psychiatry_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychiatry_intake_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "psychiatry_intakes_select_patient" ON public.psychiatry_intakes;
CREATE POLICY "psychiatry_intakes_select_patient"
  ON public.psychiatry_intakes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = psychiatry_intakes.patient_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS "psychiatry_intakes_insert_patient" ON public.psychiatry_intakes;
CREATE POLICY "psychiatry_intakes_insert_patient"
  ON public.psychiatry_intakes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = psychiatry_intakes.patient_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS "psychiatry_intakes_update_patient" ON public.psychiatry_intakes;
CREATE POLICY "psychiatry_intakes_update_patient"
  ON public.psychiatry_intakes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = psychiatry_intakes.patient_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = psychiatry_intakes.patient_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS "psychiatry_intakes_delete_patient" ON public.psychiatry_intakes;
CREATE POLICY "psychiatry_intakes_delete_patient"
  ON public.psychiatry_intakes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = psychiatry_intakes.patient_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS "psychiatry_intake_sections_select_patient" ON public.psychiatry_intake_sections;
CREATE POLICY "psychiatry_intake_sections_select_patient"
  ON public.psychiatry_intake_sections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.psychiatry_intakes i
      JOIN public.patients p ON p.id = i.patient_id
      WHERE i.id = psychiatry_intake_sections.intake_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS "psychiatry_intake_sections_insert_patient" ON public.psychiatry_intake_sections;
CREATE POLICY "psychiatry_intake_sections_insert_patient"
  ON public.psychiatry_intake_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.psychiatry_intakes i
      JOIN public.patients p ON p.id = i.patient_id
      WHERE i.id = psychiatry_intake_sections.intake_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS "psychiatry_intake_sections_update_patient" ON public.psychiatry_intake_sections;
CREATE POLICY "psychiatry_intake_sections_update_patient"
  ON public.psychiatry_intake_sections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.psychiatry_intakes i
      JOIN public.patients p ON p.id = i.patient_id
      WHERE i.id = psychiatry_intake_sections.intake_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.psychiatry_intakes i
      JOIN public.patients p ON p.id = i.patient_id
      WHERE i.id = psychiatry_intake_sections.intake_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS "psychiatry_intake_sections_delete_patient" ON public.psychiatry_intake_sections;
CREATE POLICY "psychiatry_intake_sections_delete_patient"
  ON public.psychiatry_intake_sections
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.psychiatry_intakes i
      JOIN public.patients p ON p.id = i.patient_id
      WHERE i.id = psychiatry_intake_sections.intake_id
        AND p.user_id = auth.uid()
        AND p.active = true
    )
  );

DROP TRIGGER IF EXISTS psychiatry_intakes_updated_at ON public.psychiatry_intakes;
CREATE TRIGGER psychiatry_intakes_updated_at
  BEFORE UPDATE ON public.psychiatry_intakes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS psychiatry_intake_sections_updated_at ON public.psychiatry_intake_sections;
CREATE TRIGGER psychiatry_intake_sections_updated_at
  BEFORE UPDATE ON public.psychiatry_intake_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_at();
