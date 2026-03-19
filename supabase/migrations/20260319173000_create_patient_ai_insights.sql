CREATE TABLE IF NOT EXISTS public.patient_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  snapshot_version text NOT NULL DEFAULT 'patient_snapshot_v1',
  provider_name text NOT NULL,
  model_name text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'patient_ai_analysis_v1',
  status text NOT NULL CHECK (status IN ('generated', 'failed', 'abstained')),
  request_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_json jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_patient_ai_insights_patient_created
  ON public.patient_ai_insights(patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.patient_ai_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_ai_insights_patient_select ON public.patient_ai_insights;
CREATE POLICY patient_ai_insights_patient_select
  ON public.patient_ai_insights
  FOR SELECT
  TO authenticated
  USING (
    patient_id IN (
      SELECT p.id
      FROM public.patients p
      WHERE p.user_id = auth.uid()
        AND COALESCE(p.active, true) = true
    )
  );

GRANT SELECT ON TABLE public.patient_ai_insights TO authenticated;
GRANT ALL ON TABLE public.patient_ai_insights TO service_role;

DROP TRIGGER IF EXISTS trg_patient_ai_insights_updated_at ON public.patient_ai_insights;
CREATE TRIGGER trg_patient_ai_insights_updated_at
  BEFORE UPDATE ON public.patient_ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_observability_updated_at();
