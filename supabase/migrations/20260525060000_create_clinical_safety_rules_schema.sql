-- Migration: 20260525060000_create_clinical_safety_rules_schema.sql
-- Goal: Phase 0 and Phase 1 Implementation of the Clinical Safety & Rule Traceability Engine

-- ============================================================================
-- 0. TYPES
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinical_setting') THEN
    CREATE TYPE public.clinical_setting AS ENUM ('uti', 'guardia', 'ward', 'outpatient');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_severity') THEN
    CREATE TYPE public.incident_severity AS ENUM ('critical', 'high', 'medium', 'low');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'equipment_status') THEN
    CREATE TYPE public.equipment_status AS ENUM ('active', 'review_required', 'under_maintenance', 'validation_pending', 'decommissioned');
  END IF;
END
$$;

-- ============================================================================
-- 0.0.1 HELPERS (Audit Immutability)
-- ============================================================================

-- Enforce append-only on immutable clinical safety audit tables
CREATE OR REPLACE FUNCTION public.prevent_safety_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CEEDS Clinical Safety Audit logs are immutable. UPDATE and DELETE operations are forbidden.'
    USING ERRCODE = 'destructive_operation_prevented';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 0.1 CEEDS BASELINE TABLES (Telemetry & Medical Equipment)
-- ============================================================================

-- 1. Patients & Clinical Incidents Schema
-- Maps directly to HL7 FHIR: Condition & Encounter
CREATE TABLE IF NOT EXISTS public.clinical_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  
  -- Terminology Alignment: SNOMED CT and CIE-10
  condition_code TEXT NOT NULL,          -- CIE-10 code (e.g., 'I21.9' for IAM, 'R51' for Cefalea)
  snomed_concept_id TEXT NOT NULL,       -- SNOMED CT ID (e.g., '57054005' for Acute Myocardial Infarction)
  condition_display TEXT NOT NULL,       -- Human-readable clinical label
  
  setting public.clinical_setting NOT NULL DEFAULT 'outpatient',
  severity public.incident_severity NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'escalated', 'resolved', 'closed')),
  
  diagnosed_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  sla_deadline TIMESTAMPTZ NOT NULL,     -- Calculated automatically on trigger
  resolution_notes TEXT,
  closed_by UUID REFERENCES public.profiles(user_id)
);

-- 2. Clinical State Transitions Audit Log (Event Sourcing light)
-- IMMUTABLE / APPEND-ONLY. Maps to HL7 FHIR: AuditEvent
CREATE TABLE IF NOT EXISTS public.clinical_incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.clinical_incidents(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID NOT NULL REFERENCES public.profiles(user_id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  event_description TEXT NOT NULL,
  
  -- Contains telemetry & clinical indicators mapped with LOINC
  clinical_evidence JSONB NOT NULL
);

-- 3. Medical Equipment Schema
-- Maps directly to HL7 FHIR: Device & DeviceMetric
CREATE TABLE IF NOT EXISTS public.medical_equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT UNIQUE NOT NULL,
  model_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  device_type TEXT NOT NULL,             -- "infusion_pump", "ventilator", "defibrillator"
  current_status public.equipment_status NOT NULL DEFAULT 'active',
  current_setting public.clinical_setting NOT NULL DEFAULT 'ward',
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_calibrated_at TIMESTAMPTZ NOT NULL,
  next_calibration_due TIMESTAMPTZ NOT NULL,
  operating_hours NUMERIC(10, 2) NOT NULL DEFAULT 0.0,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Interoperability binding
  snomed_device_code TEXT                -- SNOMED CT physical object code
);

-- 4. Equipment Maintenance Tickets (Incidents)
CREATE TABLE IF NOT EXISTS public.equipment_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.medical_equipment(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.profiles(user_id),
  assigned_technician_id UUID REFERENCES public.profiles(user_id),
  severity public.incident_severity NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  next_verification_due TIMESTAMPTZ,     -- When it must be verified again
  technical_summary TEXT,
  calibration_certificate_url TEXT,       -- Verification metrological artifact
  closed_at TIMESTAMPTZ
);

-- 5. Equipment Action Events
-- IMMUTABLE / APPEND-ONLY. Maps to HL7 FHIR: AuditEvent
CREATE TABLE IF NOT EXISTS public.equipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.equipment_incidents(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID NOT NULL REFERENCES public.profiles(user_id),
  action_type TEXT NOT NULL,             -- "diagnose", "repair", "calibrate", "verify", "close"
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NOT NULL
);

-- RLS Enable for Baseline tables
ALTER TABLE public.clinical_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_events ENABLE ROW LEVEL SECURITY;

-- Select RLS Policies for Baseline tables
CREATE POLICY "Authenticated users can select clinical_incidents" ON public.clinical_incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select clinical_incident_events" ON public.clinical_incident_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select medical_equipment" ON public.medical_equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select equipment_incidents" ON public.equipment_incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select equipment_events" ON public.equipment_events FOR SELECT TO authenticated USING (true);

-- Insert RLS Policies for Baseline tables
CREATE POLICY "Authenticated users can insert clinical_incidents" ON public.clinical_incidents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert clinical_incident_events" ON public.clinical_incident_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert medical_equipment" ON public.medical_equipment FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert equipment_incidents" ON public.equipment_incidents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can insert equipment_events" ON public.equipment_events FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger Immutability for clinical_incident_events
CREATE TRIGGER trg_clinical_incident_events_audit_immutable
BEFORE UPDATE OR DELETE ON public.clinical_incident_events
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_safety_audit_mutation();

-- ============================================================================
-- 0.2 RULES ENGINE TABLES (Gobernanza & Trazabilidad)
-- ============================================================================

-- 1. Create clinical safety rules catalog table
CREATE TABLE IF NOT EXISTS public.clinical_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  snomed_concept_id TEXT, -- Concept code in SNOMED CT
  cie10_code TEXT,        -- Diagnosis code in CIE-10
  condition_display TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'active', 'deprecated')),
  clinical_source TEXT,   -- Reference clinical guideline (e.g. AHA 2023, NICE)
  responsible_doctor_id UUID REFERENCES public.profiles(user_id), -- Physician validating the rule
  effective_from TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create rule versions to support governance history
CREATE TABLE IF NOT EXISTS public.clinical_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.clinical_rules(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'active', 'deprecated')),
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(rule_id, version_number)
);

-- 3. Create setting-specific trigger conditions
CREATE TABLE IF NOT EXISTS public.clinical_rule_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id UUID NOT NULL REFERENCES public.clinical_rule_versions(id) ON DELETE CASCADE,
  setting public.clinical_setting NOT NULL, -- uti, guardia, ward, outpatient
  sla_duration INTERVAL NOT NULL,
  verification_frequency INTERVAL NOT NULL,
  escalation_action TEXT NOT NULL CHECK (escalation_action IN ('notify_chief', 'warning_telemetry', 'transfer_patient', 'audit_flag')),
  blocks_closure BOOLEAN NOT NULL DEFAULT true,
  requires_override BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(rule_version_id, setting)
);

-- 4. Create required clinical observations (LOINC-mapped parameters)
CREATE TABLE IF NOT EXISTS public.clinical_required_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id UUID NOT NULL REFERENCES public.clinical_rule_versions(id) ON DELETE CASCADE,
  parameter_name TEXT NOT NULL, -- e.g., "troponin_kinetic", "pain_vas"
  loinc_code TEXT,              -- Standard LOINC code (e.g. '10839-9')
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create mathematical and relative clinical resolution criteria
CREATE TABLE IF NOT EXISTS public.clinical_resolution_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id UUID NOT NULL REFERENCES public.clinical_rule_versions(id) ON DELETE CASCADE,
  required_observation_id UUID NOT NULL REFERENCES public.clinical_required_observations(id) ON DELETE CASCADE,
  operator TEXT NOT NULL CHECK (operator IN ('<', '<=', '>', '>=', '==', 'relative_reduction_pct', 'trend_descending')),
  threshold_value NUMERIC(10, 4),
  relative_target_pct NUMERIC(5, 2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Create Headache/Case specific Red Flags checklist table
CREATE TABLE IF NOT EXISTS public.clinical_red_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id UUID NOT NULL REFERENCES public.clinical_rule_versions(id) ON DELETE CASCADE,
  flag_key TEXT NOT NULL,       -- Technical key for engine checklist
  flag_display TEXT NOT NULL,   -- Clinical display label
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Create rule executions table (The core log for patient state evaluation)
CREATE TABLE IF NOT EXISTS public.clinical_rule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id UUID NOT NULL REFERENCES public.clinical_rule_versions(id) ON DELETE RESTRICT,
  incident_id UUID NOT NULL REFERENCES public.clinical_incidents(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  evidence_used JSONB NOT NULL,
  recommendation TEXT NOT NULL CHECK (recommendation IN ('allow_closure', 'block_closure', 'escalate')),
  reason TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Create physician overrides table (Logs clinical justifications)
CREATE TABLE IF NOT EXISTS public.clinical_rule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.clinical_rule_executions(id) ON DELETE RESTRICT,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,         -- Doctor's reasoning/override rationale
  authorized_by UUID REFERENCES public.profiles(user_id),
  overridden_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Create clinical rule governance & audit events table
CREATE TABLE IF NOT EXISTS public.clinical_rule_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID NOT NULL REFERENCES public.profiles(user_id),
  action_type TEXT NOT NULL CHECK (action_type IN ('rule_create', 'rule_publish', 'rule_deprecate', 'override_register')),
  entity_affected TEXT NOT NULL,
  event_data JSONB NOT NULL
);

-- 10. Create unified terminology mapping index table
CREATE TABLE IF NOT EXISTS public.terminology_code_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system_source TEXT NOT NULL,  -- e.g. 'CIE-10', 'SNOMED-CT', 'LOINC', 'LOCAL'
  source_code TEXT NOT NULL,
  system_target TEXT NOT NULL,  -- e.g. 'SNOMED-CT', 'LOINC'
  target_code TEXT NOT NULL,
  concept_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(system_source, source_code, system_target)
);

-- =========================================================================
-- SECURITY AND IMMUTABILITY CONTROLS
-- =========================================================================

-- Enforce append-only on clinical_rule_executions, clinical_rule_overrides, and clinical_rule_audit_events


CREATE TRIGGER trg_clinical_rule_executions_immutable
BEFORE UPDATE OR DELETE ON public.clinical_rule_executions
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_safety_audit_mutation();

CREATE TRIGGER trg_clinical_rule_overrides_immutable
BEFORE UPDATE OR DELETE ON public.clinical_rule_overrides
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_safety_audit_mutation();

CREATE TRIGGER trg_clinical_rule_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.clinical_rule_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_safety_audit_mutation();

-- Enable Row Level Security (RLS) across all 10 tables
ALTER TABLE public.clinical_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_rule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_required_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_resolution_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_red_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_rule_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_rule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_rule_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminology_code_map ENABLE ROW LEVEL SECURITY;

-- Define clean, structured RLS policies
-- 1. Rules, Versions, Conditions, Observations, Criteria, Flags, Mappings are readable by all authenticated users
CREATE POLICY "Authenticated users can select rules" ON public.clinical_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select rule versions" ON public.clinical_rule_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select rule conditions" ON public.clinical_rule_conditions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select required observations" ON public.clinical_required_observations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select criteria" ON public.clinical_resolution_criteria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select red flags" ON public.clinical_red_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can select terminology maps" ON public.terminology_code_map FOR SELECT TO authenticated USING (true);

-- 2. Executions are readable by authenticated users and insertable by authenticated users (Doctors/Staff)
CREATE POLICY "Authenticated users can select executions" ON public.clinical_rule_executions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert executions" ON public.clinical_rule_executions FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Overrides are readable and insertable by authenticated users
CREATE POLICY "Authenticated users can select overrides" ON public.clinical_rule_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert overrides" ON public.clinical_rule_overrides FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Audit events are readable by authenticated users and insertable by authenticated users
CREATE POLICY "Authenticated users can select safety audits" ON public.clinical_rule_audit_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert safety audits" ON public.clinical_rule_audit_events FOR INSERT TO authenticated WITH CHECK (true);

-- =========================================================================
-- INDEX OPTIMIZATIONS
-- =========================================================================
CREATE INDEX idx_clinical_rules_snomed ON public.clinical_rules(snomed_concept_id);
CREATE INDEX idx_clinical_rules_cie10 ON public.clinical_rules(cie10_code);
CREATE INDEX idx_clinical_rule_versions_rule ON public.clinical_rule_versions(rule_id);
CREATE INDEX idx_clinical_rule_conditions_version ON public.clinical_rule_conditions(rule_version_id);
CREATE INDEX idx_clinical_required_obs_version ON public.clinical_required_observations(rule_version_id);
CREATE INDEX idx_clinical_resolution_crit_version ON public.clinical_resolution_criteria(rule_version_id);
CREATE INDEX idx_clinical_red_flags_version ON public.clinical_red_flags(rule_version_id);
CREATE INDEX idx_clinical_rule_executions_incident ON public.clinical_rule_executions(incident_id);
CREATE INDEX idx_clinical_rule_executions_patient ON public.clinical_rule_executions(patient_id);
CREATE INDEX idx_clinical_rule_overrides_exec ON public.clinical_rule_overrides(execution_id);
CREATE INDEX idx_terminology_map_lookup ON public.terminology_code_map(system_source, source_code);
