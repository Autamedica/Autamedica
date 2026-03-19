CREATE TABLE IF NOT EXISTS public.patient_derived_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('rule_engine', 'ai')),
  snapshot_version text NOT NULL DEFAULT 'patient_snapshot_v1',
  rule_id text,
  fingerprint text NOT NULL,
  category text NOT NULL CHECK (
    category IN ('appointments', 'history', 'prevention', 'results', 'symptoms', 'vitals', 'profile', 'ai')
  ),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  description text NOT NULL,
  evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_derived_alerts_patient_source_fingerprint
  ON public.patient_derived_alerts(patient_id, source_kind, fingerprint)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_derived_alerts_open
  ON public.patient_derived_alerts(patient_id, status, severity, updated_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.patient_derived_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_derived_alerts_patient_select ON public.patient_derived_alerts;
CREATE POLICY patient_derived_alerts_patient_select
  ON public.patient_derived_alerts
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

GRANT SELECT ON TABLE public.patient_derived_alerts TO authenticated;
GRANT ALL ON TABLE public.patient_derived_alerts TO service_role;

DROP TRIGGER IF EXISTS trg_patient_derived_alerts_updated_at ON public.patient_derived_alerts;
CREATE TRIGGER trg_patient_derived_alerts_updated_at
  BEFORE UPDATE ON public.patient_derived_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_observability_updated_at();
