-- Structured Argentine civil identity and PUCO provenance.
BEGIN;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'unverified',
 ADD COLUMN IF NOT EXISTS official_full_name text, ADD COLUMN IF NOT EXISTS official_first_name text,
 ADD COLUMN IF NOT EXISTS official_last_name text, ADD COLUMN IF NOT EXISTS official_cuil text,
 ADD COLUMN IF NOT EXISTS official_birth_date date, ADD COLUMN IF NOT EXISTS official_gender text,
 ADD COLUMN IF NOT EXISTS puco_coverage_name text, ADD COLUMN IF NOT EXISTS puco_coverage_code text,
 ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz, ADD COLUMN IF NOT EXISTS identity_source text;
ALTER TABLE public.pharmacy_dispatch_requests ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'unverified',
 ADD COLUMN IF NOT EXISTS official_full_name text, ADD COLUMN IF NOT EXISTS official_first_name text,
 ADD COLUMN IF NOT EXISTS official_last_name text, ADD COLUMN IF NOT EXISTS official_cuil text,
 ADD COLUMN IF NOT EXISTS official_birth_date date, ADD COLUMN IF NOT EXISTS official_gender text,
 ADD COLUMN IF NOT EXISTS puco_coverage_name text, ADD COLUMN IF NOT EXISTS puco_coverage_code text,
 ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz, ADD COLUMN IF NOT EXISTS identity_source text,
 ADD COLUMN IF NOT EXISTS patient_gender_code text;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS dni text, ADD COLUMN IF NOT EXISTS gender text,
 ADD COLUMN IF NOT EXISTS cuil text, ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'unverified',
 ADD COLUMN IF NOT EXISTS official_full_name text, ADD COLUMN IF NOT EXISTS official_first_name text,
 ADD COLUMN IF NOT EXISTS official_last_name text, ADD COLUMN IF NOT EXISTS official_cuil text,
 ADD COLUMN IF NOT EXISTS official_birth_date date, ADD COLUMN IF NOT EXISTS official_gender text,
 ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz, ADD COLUMN IF NOT EXISTS identity_source text;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['patients','pharmacy_dispatch_requests','doctors'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=t||'_identity_status_check' AND conrelid=('public.'||t)::regclass) THEN
   EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK(identity_status IN (''unverified'',''pending'',''verified_renaper'',''mismatch'',''not_applicable''))',t,t||'_identity_status_check');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=t||'_identity_source_check' AND conrelid=('public.'||t)::regclass) THEN
   EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK(identity_source IS NULL OR identity_source=''msal_bus_renaper'')',t,t||'_identity_source_check');
  END IF;
 END LOOP;
END $$;
COMMENT ON COLUMN public.patients.official_full_name IS 'Nombre legal retornado por MSAL BUS RENAPER; nunca declarado por paciente.';
COMMENT ON COLUMN public.patients.official_cuil IS 'CUIL retornado por MSAL BUS RENAPER; administrado por servidor.';
COMMENT ON COLUMN public.patients.puco_coverage_name IS 'Cobertura devuelta por PUCO, separada de insurance_info declarado.';
COMMENT ON COLUMN public.pharmacy_dispatch_requests.identity_status IS 'Resultado civil RENAPER/PUCO del despacho; el DNI por sí solo no verifica identidad.';
COMMENT ON COLUMN public.doctors.identity_status IS 'Resultado de identidad civil independiente de la matrícula REFEPS.';
CREATE OR REPLACE FUNCTION public.guard_official_identity_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
BEGIN
 IF COALESCE(auth.role(),'') <> 'service_role' THEN
  IF TG_OP='INSERT' AND (
    COALESCE(to_jsonb(NEW)->>'identity_status','unverified') <> 'unverified'
    OR COALESCE(to_jsonb(NEW)->>'official_full_name','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'official_first_name','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'official_last_name','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'official_cuil','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'official_birth_date','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'official_gender','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'puco_coverage_name','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'puco_coverage_code','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'identity_verified_at','') <> ''
    OR COALESCE(to_jsonb(NEW)->>'identity_source','') <> ''
  ) THEN RAISE EXCEPTION 'official_identity_server_managed' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND (
   to_jsonb(NEW)->'identity_status' IS DISTINCT FROM to_jsonb(OLD)->'identity_status'
   OR to_jsonb(NEW)->'official_full_name' IS DISTINCT FROM to_jsonb(OLD)->'official_full_name'
   OR to_jsonb(NEW)->'official_first_name' IS DISTINCT FROM to_jsonb(OLD)->'official_first_name'
   OR to_jsonb(NEW)->'official_last_name' IS DISTINCT FROM to_jsonb(OLD)->'official_last_name'
   OR to_jsonb(NEW)->'official_cuil' IS DISTINCT FROM to_jsonb(OLD)->'official_cuil'
   OR to_jsonb(NEW)->'official_birth_date' IS DISTINCT FROM to_jsonb(OLD)->'official_birth_date'
   OR to_jsonb(NEW)->'official_gender' IS DISTINCT FROM to_jsonb(OLD)->'official_gender'
   OR to_jsonb(NEW)->'puco_coverage_name' IS DISTINCT FROM to_jsonb(OLD)->'puco_coverage_name'
   OR to_jsonb(NEW)->'puco_coverage_code' IS DISTINCT FROM to_jsonb(OLD)->'puco_coverage_code'
   OR to_jsonb(NEW)->'identity_verified_at' IS DISTINCT FROM to_jsonb(OLD)->'identity_verified_at'
   OR to_jsonb(NEW)->'identity_source' IS DISTINCT FROM to_jsonb(OLD)->'identity_source'
  ) THEN RAISE EXCEPTION 'official_identity_server_managed' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND to_jsonb(OLD)->>'identity_status'='verified_renaper' THEN
   IF TG_TABLE_NAME='patients' AND (
    to_jsonb(NEW)->'dni' IS DISTINCT FROM to_jsonb(OLD)->'dni'
    OR to_jsonb(NEW)->'cuil' IS DISTINCT FROM to_jsonb(OLD)->'cuil'
    OR to_jsonb(NEW)->'birth_date' IS DISTINCT FROM to_jsonb(OLD)->'birth_date'
    OR to_jsonb(NEW)->'gender' IS DISTINCT FROM to_jsonb(OLD)->'gender'
   ) THEN RAISE EXCEPTION 'verified_patient_identity_locked' USING ERRCODE='42501'; END IF;
   IF TG_TABLE_NAME='doctors' AND (
    to_jsonb(NEW)->'dni' IS DISTINCT FROM to_jsonb(OLD)->'dni'
    OR to_jsonb(NEW)->'cuil' IS DISTINCT FROM to_jsonb(OLD)->'cuil'
    OR to_jsonb(NEW)->'gender' IS DISTINCT FROM to_jsonb(OLD)->'gender'
   ) THEN RAISE EXCEPTION 'verified_doctor_identity_locked' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS patients_guard_official_identity ON public.patients;
CREATE TRIGGER patients_guard_official_identity BEFORE INSERT OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.guard_official_identity_columns();
DROP TRIGGER IF EXISTS pharmacy_dispatch_guard_official_identity ON public.pharmacy_dispatch_requests;
CREATE TRIGGER pharmacy_dispatch_guard_official_identity BEFORE INSERT OR UPDATE ON public.pharmacy_dispatch_requests FOR EACH ROW EXECUTE FUNCTION public.guard_official_identity_columns();
DROP TRIGGER IF EXISTS doctors_guard_official_identity ON public.doctors;
CREATE TRIGGER doctors_guard_official_identity BEFORE INSERT OR UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.guard_official_identity_columns();
CREATE OR REPLACE FUNCTION public.guard_verified_patient_profile_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $f$
BEGIN
 IF COALESCE(auth.role(),'') <> 'service_role' AND TG_OP='INSERT'
 AND EXISTS (SELECT 1 FROM public.patients p WHERE p.user_id=NEW.user_id AND p.identity_status='verified_renaper')
 THEN RAISE EXCEPTION 'verified_patient_legal_name_locked' USING ERRCODE='42501'; END IF;
 IF COALESCE(auth.role(),'') <> 'service_role' AND TG_OP='UPDATE'
 AND (NEW.first_name IS DISTINCT FROM OLD.first_name OR NEW.last_name IS DISTINCT FROM OLD.last_name)
 AND EXISTS (SELECT 1 FROM public.patients p WHERE p.user_id=NEW.user_id AND p.identity_status='verified_renaper')
 THEN RAISE EXCEPTION 'verified_patient_legal_name_locked' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS profiles_guard_verified_patient_name ON public.profiles;
CREATE TRIGGER profiles_guard_verified_patient_name BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_verified_patient_profile_name();
COMMIT;
