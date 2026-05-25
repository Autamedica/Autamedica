-- Plantillas rápidas de recetas por médico.
-- Permiten precargar medicación e indicaciones frecuentes sin repetir escritura manual.

CREATE TABLE IF NOT EXISTS public.doctor_prescription_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  name text NOT NULL,
  medication_name text NOT NULL,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  diagnosis text,
  notes text,
  side_effects_warning text,
  care_guide_tips text,
  care_guide_forgotten text,
  care_guide_warnings text,
  care_guide_lifestyle text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT doctor_prescription_templates_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT doctor_prescription_templates_medication_not_blank CHECK (length(btrim(medication_name)) > 0),
  CONSTRAINT doctor_prescription_templates_name_unique UNIQUE (doctor_id, name)
);

CREATE INDEX IF NOT EXISTS idx_doctor_prescription_templates_doctor
  ON public.doctor_prescription_templates (doctor_id, updated_at DESC);

ALTER TABLE public.doctor_prescription_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctor_prescription_templates_select_own ON public.doctor_prescription_templates;
CREATE POLICY doctor_prescription_templates_select_own
  ON public.doctor_prescription_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = doctor_prescription_templates.doctor_id
        AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS doctor_prescription_templates_insert_own ON public.doctor_prescription_templates;
CREATE POLICY doctor_prescription_templates_insert_own
  ON public.doctor_prescription_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = doctor_prescription_templates.doctor_id
        AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS doctor_prescription_templates_update_own ON public.doctor_prescription_templates;
CREATE POLICY doctor_prescription_templates_update_own
  ON public.doctor_prescription_templates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = doctor_prescription_templates.doctor_id
        AND d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = doctor_prescription_templates.doctor_id
        AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS doctor_prescription_templates_delete_own ON public.doctor_prescription_templates;
CREATE POLICY doctor_prescription_templates_delete_own
  ON public.doctor_prescription_templates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.id = doctor_prescription_templates.doctor_id
        AND d.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_doctor_prescription_template_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.doctor_prescription_templates
    WHERE doctor_id = NEW.doctor_id
  ) >= 12 THEN
    RAISE EXCEPTION 'doctor_prescription_template_limit_reached';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_doctor_prescription_template_limit
  ON public.doctor_prescription_templates;
CREATE TRIGGER enforce_doctor_prescription_template_limit
  BEFORE INSERT ON public.doctor_prescription_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_doctor_prescription_template_limit();

CREATE OR REPLACE FUNCTION public.touch_doctor_prescription_template_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_doctor_prescription_template_updated_at
  ON public.doctor_prescription_templates;
CREATE TRIGGER touch_doctor_prescription_template_updated_at
  BEFORE UPDATE ON public.doctor_prescription_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_doctor_prescription_template_updated_at();
