-- ══════════════════════════════════════════════════════════════════════════
-- Migration: Canonical Clinical Case State Persistence
--
-- Stores the full ClinicalCaseState JSONB per case, enabling:
-- 1. Resumable intake across sessions
-- 2. Server-side prompt snapshot for Gemini Live
-- 3. Doctor dashboard: review field provenance and conflicts
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.clinical_case_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifiers
  case_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,

  -- Workflow context
  workflow_type TEXT NOT NULL DEFAULT 'psychiatry_first_visit',
  current_segment TEXT NOT NULL DEFAULT 'identity',
  completed_segments TEXT[] NOT NULL DEFAULT '{}',

  -- The canonical state blob (ClinicalCaseState JSON)
  state JSONB NOT NULL DEFAULT '{}',

  -- Integrity summary (denormalized for dashboards/queries)
  integrity_score INTEGER NOT NULL DEFAULT 0,
  integrity_status TEXT NOT NULL DEFAULT 'healthy'
    CHECK (integrity_status IN ('healthy', 'degraded', 'broken')),

  -- Planner summary (denormalized for quick access)
  missing_field_count INTEGER NOT NULL DEFAULT 0,
  conflicted_field_count INTEGER NOT NULL DEFAULT 0,
  locked_field_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One state per case
  UNIQUE(case_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clinical_case_states_patient
  ON public.clinical_case_states(patient_id);

CREATE INDEX IF NOT EXISTS idx_clinical_case_states_status
  ON public.clinical_case_states(integrity_status)
  WHERE integrity_status != 'healthy';

-- ── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.clinical_case_states ENABLE ROW LEVEL SECURITY;

-- Patients can view their own clinical states
CREATE POLICY "patients_view_own_clinical_states"
  ON public.clinical_case_states
  FOR SELECT
  USING (
    patient_id IN (
      SELECT id FROM public.patients WHERE user_id = auth.uid()
    )
  );

-- Patients can insert/update their own clinical states
CREATE POLICY "patients_upsert_own_clinical_states"
  ON public.clinical_case_states
  FOR INSERT
  WITH CHECK (
    patient_id IN (
      SELECT id FROM public.patients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "patients_update_own_clinical_states"
  ON public.clinical_case_states
  FOR UPDATE
  USING (
    patient_id IN (
      SELECT id FROM public.patients WHERE user_id = auth.uid()
    )
  );

-- Doctors can read their patients' clinical states
CREATE POLICY "doctors_view_patient_clinical_states"
  ON public.clinical_case_states
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.patient_id = clinical_case_states.patient_id
        AND a.doctor_id IN (
          SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
        )
    )
  );

-- Service role (Edge Functions) can do anything
CREATE POLICY "service_role_full_access_clinical_states"
  ON public.clinical_case_states
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── Auto-update updated_at ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_clinical_case_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinical_case_state_updated_at
  BEFORE UPDATE ON public.clinical_case_states
  FOR EACH ROW
  EXECUTE FUNCTION public.set_clinical_case_state_updated_at();

-- Grant access
GRANT SELECT, INSERT, UPDATE ON public.clinical_case_states TO authenticated;
GRANT ALL ON public.clinical_case_states TO service_role;
