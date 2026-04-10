-- ══════════════════════════════════════════════════════════════════════════
-- Migration: Add Triage Priority and Mandate to Clinical Case States
--
-- Enables fast querying of urgent cases and operational tracking.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clinical_case_states
ADD COLUMN IF NOT EXISTS triage_priority TEXT NOT NULL DEFAULT 'routine'
  CHECK (triage_priority IN ('routine', 'priority', 'urgent')),
ADD COLUMN IF NOT EXISTS triage_mandate TEXT;

-- Index for searching urgent cases
CREATE INDEX IF NOT EXISTS idx_clinical_case_states_triage_priority
  ON public.clinical_case_states(triage_priority)
  WHERE triage_priority != 'routine';

-- Update existing records by extracting from state JSONB if possible
UPDATE public.clinical_case_states
SET 
  triage_priority = COALESCE(state->'triage'->>'priority', 'routine'),
  triage_mandate = state->'triage'->>'mandate'
WHERE state ? 'triage';
