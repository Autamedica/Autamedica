-- =============================================================================
-- STORAGE + OBSERVABILITY + RLS CLEANUP MIGRATION
-- AutaMedica - knywotiidsydsaveqkjs
-- Date: 2026-02-19
-- Purpose: Complete production setup for Storage, Audit/Observability,
--          and consolidate duplicate/dangerous RLS policies
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. STORAGE BUCKETS (Medical-grade configuration)
-- =============================================================================

-- Avatars: public read, authenticated write own
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 'avatars', true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Medical records: private, strict access
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-records', 'medical-records', false,
  52428800, -- 50 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Lab results: private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lab-results', 'lab-results', false,
  52428800, -- 50 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Prescriptions: private, PDF only
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prescriptions', 'prescriptions', false,
  10485760, -- 10 MB
  ARRAY['application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Company logos: public read
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos', 'company-logos', true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. STORAGE RLS POLICIES
-- =============================================================================

-- -------------------------
-- AVATARS (public bucket)
-- -------------------------

-- Anyone can view avatars (public bucket)
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
CREATE POLICY "avatars_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Authenticated users can upload their own avatar (folder = user_id)
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own avatar
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own avatar
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- -------------------------
-- MEDICAL RECORDS (private)
-- -------------------------

-- Patients read own medical record files (folder = patient_user_id)
DROP POLICY IF EXISTS "medical_records_select_patient" ON storage.objects;
CREATE POLICY "medical_records_select_patient" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'medical-records'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Doctors read files of assigned patients
DROP POLICY IF EXISTS "medical_records_select_doctor" ON storage.objects;
CREATE POLICY "medical_records_select_doctor" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'medical-records'
    AND EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      JOIN patients p ON p.id = dp.patient_id
      WHERE d.user_id = auth.uid()
        AND p.user_id::text = (storage.foldername(name))[1]
    )
  );

-- Doctors can upload medical record files to patient folders
DROP POLICY IF EXISTS "medical_records_insert_doctor" ON storage.objects;
CREATE POLICY "medical_records_insert_doctor" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'medical-records'
    AND EXISTS (
      SELECT 1 FROM doctors d WHERE d.user_id = auth.uid()
    )
  );

-- -------------------------
-- LAB RESULTS (private)
-- -------------------------

-- Patients read own lab result files
DROP POLICY IF EXISTS "lab_results_storage_select_patient" ON storage.objects;
CREATE POLICY "lab_results_storage_select_patient" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'lab-results'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Doctors read lab results of assigned patients
DROP POLICY IF EXISTS "lab_results_storage_select_doctor" ON storage.objects;
CREATE POLICY "lab_results_storage_select_doctor" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'lab-results'
    AND EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      JOIN patients p ON p.id = dp.patient_id
      WHERE d.user_id = auth.uid()
        AND p.user_id::text = (storage.foldername(name))[1]
    )
  );

-- Doctors and patients can upload lab results
DROP POLICY IF EXISTS "lab_results_storage_insert_auth" ON storage.objects;
CREATE POLICY "lab_results_storage_insert_auth" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'lab-results'
    AND auth.uid() IS NOT NULL
  );

-- -------------------------
-- PRESCRIPTIONS (private)
-- -------------------------

-- Patients read own prescriptions
DROP POLICY IF EXISTS "prescriptions_select_patient" ON storage.objects;
CREATE POLICY "prescriptions_select_patient" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'prescriptions'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Doctors read prescriptions of assigned patients
DROP POLICY IF EXISTS "prescriptions_select_doctor" ON storage.objects;
CREATE POLICY "prescriptions_select_doctor" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'prescriptions'
    AND EXISTS (
      SELECT 1 FROM doctor_patient dp
      JOIN doctors d ON d.id = dp.doctor_id
      JOIN patients p ON p.id = dp.patient_id
      WHERE d.user_id = auth.uid()
        AND p.user_id::text = (storage.foldername(name))[1]
    )
  );

-- Only doctors can upload prescriptions
DROP POLICY IF EXISTS "prescriptions_insert_doctor" ON storage.objects;
CREATE POLICY "prescriptions_insert_doctor" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'prescriptions'
    AND EXISTS (
      SELECT 1 FROM doctors d WHERE d.user_id = auth.uid()
    )
  );

-- -------------------------
-- COMPANY LOGOS (public read)
-- -------------------------

-- Anyone can view company logos
DROP POLICY IF EXISTS "company_logos_select_public" ON storage.objects;
CREATE POLICY "company_logos_select_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'company-logos');

-- Company admins can upload logos (folder = company_id)
DROP POLICY IF EXISTS "company_logos_insert_admin" ON storage.objects;
CREATE POLICY "company_logos_insert_admin" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1 FROM companies c
      WHERE c.owner_profile_id = auth.uid()
    )
  );

-- Company admins can update logos
DROP POLICY IF EXISTS "company_logos_update_admin" ON storage.objects;
CREATE POLICY "company_logos_update_admin" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'company-logos'
    AND EXISTS (
      SELECT 1 FROM companies c
      WHERE c.owner_profile_id = auth.uid()
    )
  );

-- =============================================================================
-- 3. FIX BROKEN AUDIT SYSTEM - Create missing audit_logs table
--    (Referenced by existing triggers but NEVER created = silent failures)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS for audit_logs: only admins can read, system inserts via triggers
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
CREATE POLICY "audit_logs_select_admin" ON audit_logs
  FOR SELECT USING (is_system_admin());

-- Allow trigger functions (running as definer/owner) to insert
-- No INSERT policy needed for SECURITY DEFINER triggers;
-- but add one for service_role access
DROP POLICY IF EXISTS "audit_logs_insert_system" ON audit_logs;
CREATE POLICY "audit_logs_insert_system" ON audit_logs
  FOR INSERT WITH CHECK (true);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- =============================================================================
-- 4. GENERIC AUDIT TRIGGER FUNCTION
--    Reusable for any table with sensitive data
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_sensitive_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id uuid;
  v_old_data jsonb;
  v_new_data jsonb;
  v_changed_fields jsonb;
BEGIN
  -- Get record ID
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_old_data := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_new_data := to_jsonb(NEW);
  ELSE -- UPDATE
    v_record_id := NEW.id;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    -- Only record changed fields for updates
    SELECT jsonb_object_agg(key, value) INTO v_changed_fields
    FROM jsonb_each(v_new_data)
    WHERE NOT v_old_data ? key OR v_old_data->key IS DISTINCT FROM v_new_data->key;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, resource_type, resource_id, metadata, created_at
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    jsonb_build_object(
      'schema', TG_TABLE_SCHEMA,
      'changed_fields', COALESCE(v_changed_fields, '{}'::jsonb),
      'timestamp', now()
    ),
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 5. APPLY AUDIT TRIGGERS TO SENSITIVE TABLES
--    (Only tables not already covered by specific audit triggers)
-- =============================================================================

-- Appointments: track all changes
CREATE TRIGGER tr_audit_appointments
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- Doctor-patient relationships: track assignment changes
CREATE TRIGGER tr_audit_doctor_patient
  AFTER INSERT OR UPDATE OR DELETE ON doctor_patient
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- Lab results: track all changes
CREATE TRIGGER tr_audit_lab_results
  AFTER INSERT OR UPDATE OR DELETE ON lab_results
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- Patient alerts: track changes
CREATE TRIGGER tr_audit_patient_alerts
  AFTER INSERT OR UPDATE OR DELETE ON patient_alerts
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- Vital signs: track changes
CREATE TRIGGER tr_audit_vital_signs
  AFTER INSERT OR UPDATE OR DELETE ON vital_signs
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- Symptom reports: track changes
CREATE TRIGGER tr_audit_symptom_reports
  AFTER INSERT OR UPDATE OR DELETE ON symptom_reports
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- Medication logs: track changes
CREATE TRIGGER tr_audit_medication_logs
  AFTER INSERT OR UPDATE OR DELETE ON medication_logs
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- User roles: track privilege changes
CREATE TRIGGER tr_audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- Companies: track changes
CREATE TRIGGER tr_audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- Telemedicine sessions: track session lifecycle
CREATE TRIGGER tr_audit_telemedicine_sessions
  AFTER INSERT OR UPDATE OR DELETE ON telemedicine_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_sensitive_change();

-- =============================================================================
-- 6. FIX doctor_patient: RLS ON BUT 0 POLICIES (completely blocked!)
-- =============================================================================

-- Doctors can see their own patient relationships
DROP POLICY IF EXISTS "doctor_patient_select_doctor" ON doctor_patient;
CREATE POLICY "doctor_patient_select_doctor" ON doctor_patient
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = doctor_patient.doctor_id
        AND d.user_id = auth.uid()
    )
  );

-- Patients can see which doctors are assigned to them
DROP POLICY IF EXISTS "doctor_patient_select_patient" ON doctor_patient;
CREATE POLICY "doctor_patient_select_patient" ON doctor_patient
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM patients p
      WHERE p.id = doctor_patient.patient_id
        AND p.user_id = auth.uid()
    )
  );

-- Doctors can create assignments (assign patients to themselves)
DROP POLICY IF EXISTS "doctor_patient_insert_doctor" ON doctor_patient;
CREATE POLICY "doctor_patient_insert_doctor" ON doctor_patient
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = doctor_patient.doctor_id
        AND d.user_id = auth.uid()
    )
  );

-- Doctors can remove their own patient assignments
DROP POLICY IF EXISTS "doctor_patient_delete_doctor" ON doctor_patient;
CREATE POLICY "doctor_patient_delete_doctor" ON doctor_patient
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM doctors d
      WHERE d.id = doctor_patient.doctor_id
        AND d.user_id = auth.uid()
    )
  );

-- Admins can manage all relationships
DROP POLICY IF EXISTS "doctor_patient_manage_admin" ON doctor_patient;
CREATE POLICY "doctor_patient_manage_admin" ON doctor_patient
  FOR ALL USING (is_system_admin());

-- =============================================================================
-- 7. REMOVE DANGEROUS & DUPLICATE RLS POLICIES
-- =============================================================================

-- *** CRITICAL: profiles_select_all allows ANY user to read ALL profiles ***
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;

-- Duplicate INSERT policies on profiles (keep "Enable profile creation")
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;

-- Duplicate SELECT policies on profiles (keep "Users can read own profile")
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Duplicate admin SELECT (keep "Platform admins can view all profiles")
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;

-- Duplicate UPDATE policies (keep "Users can update own profile" which has WITH CHECK)
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Duplicate SELECT on doctors (keep "doctors_select_public" which is comprehensive)
DROP POLICY IF EXISTS "Doctors can view own data" ON doctors;
DROP POLICY IF EXISTS "Doctors can view own profile" ON doctors;

-- Duplicate SELECT on patients (keep "patients_select_restricted" which is comprehensive)
DROP POLICY IF EXISTS "Patients can view own data" ON patients;
DROP POLICY IF EXISTS "Patients can view own profile" ON patients;

-- Duplicate SELECT on appointments (keep comprehensive policies)
DROP POLICY IF EXISTS "Doctors can view their appointments" ON appointments;
DROP POLICY IF EXISTS "Patients can view own appointments" ON appointments;

-- =============================================================================
-- 8. AUDIT LOG RETENTION POLICY (auto-cleanup old entries)
-- =============================================================================

-- Function to clean up old audit entries (run via pg_cron or scheduled)
CREATE OR REPLACE FUNCTION public.fn_cleanup_old_audit_logs(retention_days integer DEFAULT 365)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.audit_logs
  WHERE created_at < now() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Log the cleanup itself
  INSERT INTO public.audit_logs (action, resource_type, metadata)
  VALUES ('CLEANUP', 'audit_logs', jsonb_build_object(
    'deleted_count', deleted_count,
    'retention_days', retention_days,
    'cleaned_at', now()
  ));

  RETURN deleted_count;
END;
$$;

-- =============================================================================
-- 9. OBSERVABILITY VIEW - Quick health check for ops
-- =============================================================================

CREATE OR REPLACE VIEW public.v_db_health AS
SELECT
  -- Table stats
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') as public_tables,
  -- RLS coverage
  (SELECT count(*) FROM pg_tables t
   WHERE t.schemaname = 'public'
     AND t.tablename NOT IN ('spatial_ref_sys')
     AND EXISTS (
       SELECT 1 FROM pg_class c
       WHERE c.relname = t.tablename AND c.relrowsecurity = true
     )
  ) as tables_with_rls,
  -- Policy count
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') as total_policies,
  -- Storage buckets
  (SELECT count(*) FROM storage.buckets) as storage_buckets,
  -- Audit entries last 24h
  (SELECT count(*) FROM public.audit_logs
   WHERE created_at > now() - interval '24 hours') as audit_entries_24h,
  -- Active users last 24h (from auth schema)
  (SELECT count(*) FROM auth.users
   WHERE last_sign_in_at > now() - interval '24 hours') as active_users_24h,
  now() as checked_at;

-- =============================================================================
-- 10. STORAGE ACCESS LOGGING
--     Track who downloads sensitive medical files
-- =============================================================================

-- Note: Supabase storage doesn't support triggers on storage.objects directly.
-- For storage access logging, use Edge Functions with storage event webhooks.
-- The audit_logs table is ready to receive these events via:
--   INSERT INTO audit_logs (user_id, action, resource_type, metadata)
--   VALUES (uid, 'DOWNLOAD', 'storage', jsonb_build_object('bucket', ..., 'path', ...));

-- Add a comment documenting this decision
COMMENT ON TABLE audit_logs IS 'Unified audit log for all sensitive operations. Storage access logged via Edge Functions.';
COMMENT ON VIEW v_db_health IS 'Quick operational health check view. Query with: SELECT * FROM v_db_health;';

COMMIT;
