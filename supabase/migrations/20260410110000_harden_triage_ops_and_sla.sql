-- 20260410110000_harden_triage_ops_and_sla.sql

-- ══════════════════════════════════════════════════════════════════════════
-- Migration: Clinical Triage Operational States and SLA Tracking
--
-- Adds the necessary columns to transition from simple alerts to a 
-- managed clinical resolution workflow.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clinical_case_states
-- Workflow & Taxonomies
ADD COLUMN IF NOT EXISTS clinical_vertical TEXT NOT NULL DEFAULT 'psychiatry_general'
  CHECK (clinical_vertical IN ('psychiatry_general', 'tdah_continuity', 'insomnia_management', 'anxiety_disorders', 'depressive_disorders')),
ADD COLUMN IF NOT EXISTS case_intent TEXT NOT NULL DEFAULT 'evaluation'
  CHECK (case_intent IN ('evaluation', 'continuity', 'urgent_review', 'renewal', 'follow_up')),

-- Operational Status
ADD COLUMN IF NOT EXISTS triage_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (triage_status IN ('pending', 'acknowledged', 'in_progress', 'resolved', 'escalated')),

-- Clinical Priority Ranking (1: Urgent, 2: Priority, 3: Routine)
ADD COLUMN IF NOT EXISTS triage_priority_rank INTEGER NOT NULL DEFAULT 3,

-- Materialized Snapshots (for performance and de-coupling)
ADD COLUMN IF NOT EXISTS medication_snapshot_name TEXT,
ADD COLUMN IF NOT EXISTS medication_snapshot_dose TEXT,
ADD COLUMN IF NOT EXISTS medication_snapshot_days_remaining INTEGER,

-- Ownership
ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID REFERENCES public.doctors(id),
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,

-- SLA & Criticality
ADD COLUMN IF NOT EXISTS resolution_deadline_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS risk_of_interruption TEXT DEFAULT 'low'
  CHECK (risk_of_interruption IN ('low', 'medium', 'high')),
ADD COLUMN IF NOT EXISTS requires_same_day_action BOOLEAN DEFAULT false;

-- Indexes for the new clinical queue
CREATE INDEX IF NOT EXISTS idx_clinical_case_states_ops_queue
  ON public.clinical_case_states(triage_priority_rank, triage_status, resolution_deadline_at)
  WHERE triage_status != 'resolved';

CREATE INDEX IF NOT EXISTS idx_clinical_case_states_assigned_doctor
  ON public.clinical_case_states(assigned_doctor_id)
  WHERE assigned_doctor_id IS NOT NULL;

-- ── helper functions for triage management ──────────────────────────────

-- Function for a doctor to "take" a triage case
CREATE OR REPLACE FUNCTION public.take_triage_case(p_case_state_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_doctor_id UUID;
BEGIN
    SELECT id INTO v_doctor_id FROM public.doctors WHERE user_id = auth.uid();
    
    IF v_doctor_id IS NULL THEN
        RAISE EXCEPTION 'Only registered doctors can take cases';
    END IF;

    UPDATE public.clinical_case_states
    SET 
        assigned_doctor_id = v_doctor_id,
        triage_status = 'acknowledged',
        acknowledged_at = now(),
        updated_at = now()
    WHERE id = p_case_state_id
      AND (assigned_doctor_id IS NULL OR triage_status = 'pending');
END;
$$;
