-- =============================================================================
-- PRODUCTION HARDENING MIGRATION
-- AutaMedica - knywotiidsydsaveqkjs
-- Date: 2026-02-19
-- Purpose: Fix all P0/P1 security and integrity issues
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ENABLE RLS ON UNPROTECTED TABLES
-- =============================================================================

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_patient ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. RLS POLICIES FOR TABLES WITH RLS ON BUT ZERO POLICIES
-- =============================================================================

-- lab_results: patients see own, doctors see assigned patients
CREATE POLICY "patients_read_own_lab_results" ON lab_results
  FOR SELECT USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

CREATE POLICY "doctors_read_assigned_lab_results" ON lab_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = auth.uid()
        AND dp.patient_id = lab_results.patient_id
    )
  );

CREATE POLICY "doctors_insert_lab_results" ON lab_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM doctors d WHERE d.user_id = auth.uid()
    )
  );

-- medication_logs: patients see own, doctors see assigned patients
CREATE POLICY "patients_read_own_medication_logs" ON medication_logs
  FOR SELECT USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

CREATE POLICY "doctors_read_assigned_medication_logs" ON medication_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = auth.uid()
        AND dp.patient_id = medication_logs.patient_id
    )
  );

CREATE POLICY "patients_insert_own_medication_logs" ON medication_logs
  FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

-- patient_alerts: patients see own
CREATE POLICY "patients_read_own_alerts" ON patient_alerts
  FOR SELECT USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

CREATE POLICY "doctors_read_assigned_alerts" ON patient_alerts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = auth.uid()
        AND dp.patient_id = patient_alerts.patient_id
    )
  );

CREATE POLICY "doctors_manage_alerts" ON patient_alerts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = auth.uid()
        AND dp.patient_id = patient_alerts.patient_id
    )
  );

-- symptom_reports: patients see own, doctors see assigned
CREATE POLICY "patients_read_own_symptoms" ON symptom_reports
  FOR SELECT USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

CREATE POLICY "patients_insert_own_symptoms" ON symptom_reports
  FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

CREATE POLICY "doctors_read_assigned_symptoms" ON symptom_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = auth.uid()
        AND dp.patient_id = symptom_reports.patient_id
    )
  );

-- vital_signs: patients see own, doctors see assigned
CREATE POLICY "patients_read_own_vitals" ON vital_signs
  FOR SELECT USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

CREATE POLICY "patients_insert_own_vitals" ON vital_signs
  FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
  );

CREATE POLICY "doctors_read_assigned_vitals" ON vital_signs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = auth.uid()
        AND dp.patient_id = vital_signs.patient_id
    )
  );

-- =============================================================================
-- 3. FIX CRITICAL ROLE ESCALATION VULNERABILITY
-- set_portal_and_role allows ANY user to set their role to 'admin'
-- Fix: Only allow role change if user has no role yet, or is admin
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_portal_and_role(
  p_portal text,
  p_role text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_data json;
  updated_role text;
  current_role text;
BEGIN
  -- Validar portal
  IF p_portal NOT IN ('patients','doctors','companies','admin') THEN
    RAISE EXCEPTION 'Invalid portal: %', p_portal;
  END IF;

  -- Obtener rol actual
  SELECT role INTO current_role FROM public.profiles WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', auth.uid();
  END IF;

  -- Auto-asignar rol basado en portal si no se especifica
  IF p_role IS NULL THEN
    CASE p_portal
      WHEN 'doctors' THEN updated_role := 'doctor';
      WHEN 'companies' THEN updated_role := 'company';
      WHEN 'admin' THEN updated_role := 'admin';
      ELSE updated_role := 'patient';
    END CASE;
  ELSE
    updated_role := p_role;
  END IF;

  -- Validar rol
  IF updated_role NOT IN ('patient','doctor','company','admin') THEN
    RAISE EXCEPTION 'Invalid role: %', updated_role;
  END IF;

  -- SEGURIDAD: Solo permitir cambio de rol si:
  -- 1. El usuario no tiene rol asignado aún (primera vez)
  -- 2. El usuario actual es admin (puede cambiar su propio rol)
  IF current_role IS NOT NULL AND current_role != 'admin' THEN
    RAISE EXCEPTION 'role_already_set: Cannot change role from % to %', current_role, updated_role;
  END IF;

  -- SEGURIDAD: Solo admins pueden asignarse el rol admin
  IF updated_role = 'admin' AND (current_role IS NULL OR current_role != 'admin') THEN
    RAISE EXCEPTION 'unauthorized: Only existing admins can assign admin role';
  END IF;

  -- Actualizar perfil
  UPDATE public.profiles
  SET
    portal = p_portal,
    role = updated_role,
    organization_id = COALESCE(p_organization_id, organization_id),
    updated_at = now()
  WHERE id = auth.uid();

  -- Auto-provisionar fila específica por rol
  IF updated_role = 'doctor' THEN
    INSERT INTO public.doctors (user_id) VALUES (auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  ELSIF updated_role = 'patient' THEN
    INSERT INTO public.patients (user_id) VALUES (auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Retornar datos actualizados
  SELECT json_build_object(
    'user_id', auth.uid(),
    'portal', p_portal,
    'role', updated_role,
    'organization_id', p_organization_id,
    'updated_at', now()
  ) INTO result_data;

  RETURN result_data;
END;
$$;

-- =============================================================================
-- 4. ADD MISSING INDEXES ON FOREIGN KEYS
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_medical_records_doctor_id ON medical_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_appointment_id ON medical_records(appointment_id);
CREATE INDEX IF NOT EXISTS idx_medical_chats_appointment_id ON medical_chats(appointment_id);
CREATE INDEX IF NOT EXISTS idx_companies_owner_profile_id ON companies(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_profile_id ON organizations(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_appointments_created_by ON appointments(created_by);
CREATE INDEX IF NOT EXISTS idx_lab_results_reviewed_by ON lab_results(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_lab_results_uploaded_by ON lab_results(uploaded_by_id);
CREATE INDEX IF NOT EXISTS idx_medication_logs_logged_by ON medication_logs(logged_by_id);
CREATE INDEX IF NOT EXISTS idx_org_members_invited_by ON org_members(invited_by);
CREATE INDEX IF NOT EXISTS idx_patient_alerts_created_by ON patient_alerts(created_by_id);
CREATE INDEX IF NOT EXISTS idx_patient_alerts_acknowledged_by ON patient_alerts(acknowledged_by_id);
CREATE INDEX IF NOT EXISTS idx_symptom_reports_reported_by ON symptom_reports(reported_by_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_granted_by ON user_roles(granted_by);
CREATE INDEX IF NOT EXISTS idx_vital_signs_recorded_by ON vital_signs(recorded_by_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_start ON appointments(doctor_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_start ON appointments(patient_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status_start ON appointments(status, start_time);

-- =============================================================================
-- 5. CHECK CONSTRAINTS FOR DATA INTEGRITY
-- =============================================================================

-- Roles
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT chk_profiles_role
    CHECK (role IS NULL OR role IN ('patient', 'doctor', 'company', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_roles ADD CONSTRAINT chk_user_roles_role
    CHECK (role IN ('patient', 'doctor', 'company', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Appointment status
DO $$ BEGIN
  ALTER TABLE appointments ADD CONSTRAINT chk_appointments_status
    CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Patient blood type
DO $$ BEGIN
  ALTER TABLE patients ADD CONSTRAINT chk_patients_blood_type
    CHECK (blood_type IS NULL OR blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Patient gender
DO $$ BEGIN
  ALTER TABLE patients ADD CONSTRAINT chk_patients_gender
    CHECK (gender IS NULL OR gender IN ('male', 'female', 'non_binary', 'other', 'prefer_not_to_say'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- calls.status already uses call_status ENUM — no CHECK needed

-- Medical record type
DO $$ BEGIN
  ALTER TABLE medical_records ADD CONSTRAINT chk_medical_records_type
    CHECK (type IS NULL OR type IN ('consultation', 'diagnosis', 'prescription', 'lab_result', 'imaging', 'referral', 'follow_up', 'emergency'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Patient alert severity
DO $$ BEGIN
  ALTER TABLE patient_alerts ADD CONSTRAINT chk_patient_alerts_severity
    CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Risk factor severity
DO $$ BEGIN
  ALTER TABLE patient_risk_factors ADD CONSTRAINT chk_risk_factors_severity
    CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Telemedicine session status
DO $$ BEGIN
  ALTER TABLE telemedicine_sessions ADD CONSTRAINT chk_telemedicine_status
    CHECK (status IS NULL OR status IN ('waiting', 'in_progress', 'completed', 'cancelled', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 6. CLEAN UP DUPLICATE TRIGGERS
-- =============================================================================

-- medical_records: keep trigger_update_medical_records_timestamp, drop duplicate
DROP TRIGGER IF EXISTS update_medical_records_updated_at ON medical_records;

-- telemedicine_sessions: keep trigger_update_telemedicine_sessions_timestamp, drop duplicate
DROP TRIGGER IF EXISTS update_telemedicine_sessions_updated_at ON telemedicine_sessions;

COMMIT;
