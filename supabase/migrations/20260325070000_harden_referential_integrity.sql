-- ============================================================
-- Migration: Harden Referential Integrity
-- Date: 2026-03-25
-- Purpose: Fix structural gaps found during backend audit
-- ============================================================

-- ============================================================
-- 1. Auto-create patients/doctors row on profile creation
--    ROOT CAUSE FIX: handle_new_user only creates profiles,
--    but never creates the role-specific row (patients/doctors).
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_role_specific_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'patient' THEN
    INSERT INTO public.patients (user_id, active)
    VALUES (NEW.user_id, true)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF NEW.role = 'doctor' THEN
    INSERT INTO public.doctors (user_id, license_number, specialty, active, languages)
    VALUES (
      NEW.user_id,
      'PENDING-' || substring(NEW.user_id::text, 1, 8),
      'General',
      true,
      ARRAY['Spanish']
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_role_record ON public.profiles;
CREATE TRIGGER trg_ensure_role_record
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_role_specific_record();


-- ============================================================
-- 2. Auto-populate doctor_patient on appointment creation
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_doctor_patient_relationship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.doctor_patient (doctor_id, patient_id)
  VALUES (NEW.doctor_id, NEW.patient_id)
  ON CONFLICT (doctor_id, patient_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_doctor_patient ON public.appointments;
CREATE TRIGGER trg_ensure_doctor_patient
  AFTER INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_doctor_patient_relationship();


-- ============================================================
-- 3. Fix fn_audit_sensitive_change for composite-PK tables
--    The existing function does NEW.id which crashes on tables
--    without an `id` column (e.g. doctor_patient).
--    Fix: use to_jsonb() first, extract 'id' safely via JSONB.
-- ============================================================

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
  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_record_id := (v_old_data->>'id')::uuid;
  ELSIF TG_OP = 'INSERT' THEN
    v_new_data := to_jsonb(NEW);
    v_record_id := (v_new_data->>'id')::uuid;
  ELSE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_record_id := (v_new_data->>'id')::uuid;
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
      'old_data', v_old_data,
      'new_data', v_new_data,
      'changed_fields', v_changed_fields,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA
    ),
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


-- ============================================================
-- 4. Backfill: create doctor_patient for existing appointments
--    (Now safe after fixing the audit trigger above)
-- ============================================================

INSERT INTO public.doctor_patient (doctor_id, patient_id)
SELECT DISTINCT doctor_id, patient_id
FROM public.appointments
WHERE doctor_id IS NOT NULL AND patient_id IS NOT NULL
ON CONFLICT (doctor_id, patient_id) DO NOTHING;


-- ============================================================
-- 5. Prevent orphaned profiles: detection RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_orphaned_profiles()
RETURNS TABLE (
  out_user_id uuid,
  out_email text,
  out_role text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT p.user_id, p.email, p.role
  FROM profiles p
  WHERE p.active = true
    AND p.role = 'patient'
    AND NOT EXISTS (SELECT 1 FROM patients pt WHERE pt.user_id = p.user_id)
  UNION ALL
  SELECT p.user_id, p.email, p.role
  FROM profiles p
  WHERE p.active = true
    AND p.role = 'doctor'
    AND NOT EXISTS (SELECT 1 FROM doctors d WHERE d.user_id = p.user_id);
$$;


-- ============================================================
-- 6. Storage bucket RLS policies
-- ============================================================

DO $$ BEGIN
  DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
  DROP POLICY IF EXISTS "avatars_auth_insert" ON storage.objects;
  DROP POLICY IF EXISTS "avatars_auth_update" ON storage.objects;
  DROP POLICY IF EXISTS "avatars_auth_delete" ON storage.objects;
  DROP POLICY IF EXISTS "medical_docs_owner_read" ON storage.objects;
  DROP POLICY IF EXISTS "medical_docs_owner_insert" ON storage.objects;
  DROP POLICY IF EXISTS "medical_docs_owner_delete" ON storage.objects;
  DROP POLICY IF EXISTS "consultation_files_owner_read" ON storage.objects;
  DROP POLICY IF EXISTS "consultation_files_owner_insert" ON storage.objects;
  DROP POLICY IF EXISTS "consultation_files_owner_delete" ON storage.objects;
END $$;

CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "avatars_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "medical_docs_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'medical-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "medical_docs_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'medical-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "medical_docs_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'medical-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "consultation_files_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'consultation-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "consultation_files_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'consultation-files' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "consultation_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'consultation-files' AND (storage.foldername(name))[1] = auth.uid()::text);


-- ============================================================
-- 7. Add missing defaults on critical columns
-- ============================================================

ALTER TABLE public.appointments
  ALTER COLUMN status SET DEFAULT 'scheduled',
  ALTER COLUMN duration_minutes SET DEFAULT 30,
  ALTER COLUMN type SET DEFAULT 'telemedicine';

ALTER TABLE public.calls
  ALTER COLUMN status SET DEFAULT 'requested';

ALTER TABLE public.anamnesis
  ALTER COLUMN status SET DEFAULT 'in_progress',
  ALTER COLUMN completion_percentage SET DEFAULT 0,
  ALTER COLUMN locked SET DEFAULT false;


-- ============================================================
-- 8. Performance indexes for common query patterns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_appointments_patient_status
  ON public.appointments (patient_id, status);

CREATE INDEX IF NOT EXISTS idx_appointments_doctor_status
  ON public.appointments (doctor_id, status);

CREATE INDEX IF NOT EXISTS idx_anamnesis_patient_status
  ON public.anamnesis (patient_id, status);

CREATE INDEX IF NOT EXISTS idx_calls_doctor_status
  ON public.calls (doctor_id, status);

CREATE INDEX IF NOT EXISTS idx_calls_patient_status
  ON public.calls (patient_id, status);

CREATE INDEX IF NOT EXISTS idx_profiles_role_active
  ON public.profiles (role, active);
