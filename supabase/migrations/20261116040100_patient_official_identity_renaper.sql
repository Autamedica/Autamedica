-- Structured Argentine civil identity and PUCO provenance.
BEGIN;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'unverified',
 ADD COLUMN IF NOT EXISTS official_full_name text, ADD COLUMN IF NOT EXISTS official_first_name text,
 ADD COLUMN IF NOT EXISTS official_last_name text, ADD COLUMN IF NOT EXISTS official_cuil text,
 ADD COLUMN IF NOT EXISTS official_birth_date date, ADD COLUMN IF NOT EXISTS official_gender text,
 ADD COLUMN IF NOT EXISTS puco_coverage_name text, ADD COLUMN IF NOT EXISTS puco_coverage_code text,
 ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz, ADD COLUMN IF NOT EXISTS identity_source text,
 ADD COLUMN IF NOT EXISTS identity_lookup_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.pharmacy_dispatch_requests ADD COLUMN IF NOT EXISTS identity_status text NOT NULL DEFAULT 'unverified',
 ADD COLUMN IF NOT EXISTS official_full_name text, ADD COLUMN IF NOT EXISTS official_first_name text,
 ADD COLUMN IF NOT EXISTS official_last_name text, ADD COLUMN IF NOT EXISTS official_cuil text,
 ADD COLUMN IF NOT EXISTS official_birth_date date, ADD COLUMN IF NOT EXISTS official_gender text,
 ADD COLUMN IF NOT EXISTS puco_coverage_name text, ADD COLUMN IF NOT EXISTS puco_coverage_code text,
 ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz, ADD COLUMN IF NOT EXISTS identity_source text,
 ADD COLUMN IF NOT EXISTS patient_gender_code text,
 ADD COLUMN IF NOT EXISTS identity_lookup_count integer NOT NULL DEFAULT 0;
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

-- Row locking makes the per-patient / per-dispatch limit safe under concurrency.
CREATE OR REPLACE FUNCTION public.claim_renaper_identity_lookup(
 p_patient_id uuid DEFAULT NULL,
 p_dispatch_request_id uuid DEFAULT NULL,
 p_limit integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
 v_count integer;
BEGIN
 IF p_limit < 1 OR p_limit > 10
   OR (p_patient_id IS NULL AND p_dispatch_request_id IS NULL)
   OR (p_patient_id IS NOT NULL AND p_dispatch_request_id IS NOT NULL) THEN
  RAISE EXCEPTION 'invalid_renaper_lookup_scope' USING ERRCODE = '22023';
 END IF;

 IF p_patient_id IS NOT NULL THEN
  SELECT identity_lookup_count INTO v_count
    FROM public.patients WHERE id = p_patient_id FOR UPDATE;
  IF NOT FOUND THEN RETURN -2; END IF;
  IF v_count >= p_limit THEN RETURN -1; END IF;
  UPDATE public.patients SET identity_lookup_count = v_count + 1, updated_at = now()
   WHERE id = p_patient_id;
 ELSE
  SELECT identity_lookup_count INTO v_count
    FROM public.pharmacy_dispatch_requests WHERE id = p_dispatch_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN -2; END IF;
  IF v_count >= p_limit THEN RETURN -1; END IF;
  UPDATE public.pharmacy_dispatch_requests SET identity_lookup_count = v_count + 1
   WHERE id = p_dispatch_request_id;
 END IF;
 RETURN v_count + 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_renaper_identity_lookup(uuid, uuid, integer)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_renaper_identity_lookup(uuid, uuid, integer)
 TO service_role;

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

-- Trigger functions execute through their owning triggers; revoke direct invocation.
REVOKE ALL ON FUNCTION public.guard_official_identity_columns() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_official_identity_columns() TO service_role;
REVOKE ALL ON FUNCTION public.guard_verified_patient_profile_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_verified_patient_profile_name() TO service_role;

-- Apply official identity, dispatch evidence and legal profile name in one transaction.
CREATE OR REPLACE FUNCTION public.persist_renaper_identity_result(
 p_patient_id uuid,
 p_dispatch_request_id uuid,
 p_user_id uuid,
 p_identity_status text,
 p_dni text,
 p_official_full_name text,
 p_official_first_name text,
 p_official_last_name text,
 p_official_cuil text,
 p_official_birth_date date,
 p_official_gender text,
 p_puco_coverage_name text,
 p_puco_coverage_code text,
 p_verified_at timestamptz,
 p_sync_profile_name boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
 v_patient_user_id uuid;
 v_dispatch_patient_id uuid;
BEGIN
 IF p_patient_id IS NULL AND p_dispatch_request_id IS NULL THEN
  RAISE EXCEPTION 'renaper_identity_target_required' USING ERRCODE = '22023';
 END IF;
 IF p_identity_status IS NULL OR p_identity_status NOT IN ('pending', 'mismatch', 'verified_renaper')
   OR p_dni IS NULL OR char_length(p_dni) NOT BETWEEN 6 AND 12 OR p_dni ~ '[^0-9]' THEN
  RAISE EXCEPTION 'invalid_renaper_identity_result' USING ERRCODE = '22023';
 END IF;
 IF p_identity_status = 'verified_renaper'
   AND (NULLIF(btrim(p_official_full_name), '') IS NULL
     OR p_official_cuil IS NULL OR char_length(p_official_cuil) <> 11 OR p_official_cuil ~ '[^0-9]'
     OR p_official_gender IS NULL OR p_official_gender NOT IN ('F', 'M', 'X')
     OR p_verified_at IS NULL) THEN
  RAISE EXCEPTION 'incomplete_verified_renaper_identity' USING ERRCODE = '22023';
 END IF;

 IF p_patient_id IS NOT NULL THEN
  SELECT user_id INTO v_patient_user_id
    FROM public.patients WHERE id = p_patient_id FOR UPDATE;
  IF NOT FOUND OR (p_user_id IS NOT NULL AND v_patient_user_id IS DISTINCT FROM p_user_id) THEN
   RAISE EXCEPTION 'renaper_patient_scope_mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
     SET identity_status = p_identity_status,
         official_full_name = p_official_full_name,
         official_first_name = p_official_first_name,
         official_last_name = p_official_last_name,
         official_cuil = p_official_cuil,
         official_birth_date = p_official_birth_date,
         official_gender = p_official_gender,
         puco_coverage_name = p_puco_coverage_name,
         puco_coverage_code = p_puco_coverage_code,
         identity_verified_at = CASE WHEN p_identity_status = 'verified_renaper' THEN p_verified_at ELSE NULL END,
         identity_source = 'msal_bus_renaper',
         dni = CASE WHEN p_identity_status = 'verified_renaper' THEN p_dni ELSE dni END,
         cuil = CASE WHEN p_identity_status = 'verified_renaper' THEN p_official_cuil ELSE cuil END,
         birth_date = CASE WHEN p_identity_status = 'verified_renaper' AND p_official_birth_date IS NOT NULL THEN p_official_birth_date ELSE birth_date END,
         gender = CASE WHEN p_identity_status = 'verified_renaper'
           THEN CASE p_official_gender WHEN 'F' THEN 'female' WHEN 'M' THEN 'male' WHEN 'X' THEN 'other' END
           ELSE gender END,
         updated_at = now()
   WHERE id = p_patient_id;
 END IF;

 IF p_dispatch_request_id IS NOT NULL THEN
  SELECT patient_id INTO v_dispatch_patient_id
    FROM public.pharmacy_dispatch_requests
   WHERE id = p_dispatch_request_id FOR UPDATE;
  IF NOT FOUND OR (p_patient_id IS NOT NULL AND v_dispatch_patient_id IS DISTINCT FROM p_patient_id) THEN
   RAISE EXCEPTION 'renaper_dispatch_scope_mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pharmacy_dispatch_requests
     SET identity_status = p_identity_status,
         official_full_name = p_official_full_name,
         official_first_name = p_official_first_name,
         official_last_name = p_official_last_name,
         official_cuil = p_official_cuil,
         official_birth_date = p_official_birth_date,
         official_gender = p_official_gender,
         puco_coverage_name = p_puco_coverage_name,
         puco_coverage_code = p_puco_coverage_code,
         identity_verified_at = CASE WHEN p_identity_status = 'verified_renaper' THEN p_verified_at ELSE NULL END,
         identity_source = 'msal_bus_renaper',
         patient_dni = p_dni
   WHERE id = p_dispatch_request_id;
 END IF;

 IF p_sync_profile_name IS TRUE AND p_identity_status = 'verified_renaper' AND p_user_id IS NOT NULL
   AND NULLIF(btrim(p_official_first_name), '') IS NOT NULL
   AND NULLIF(btrim(p_official_last_name), '') IS NOT NULL THEN
  UPDATE public.profiles
     SET first_name = p_official_first_name,
         last_name = p_official_last_name,
         updated_at = now()
   WHERE user_id = p_user_id;
 END IF;

 RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.persist_renaper_identity_result(
 uuid, uuid, uuid, text, text, text, text, text, text, date, text, text, text, timestamptz, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_renaper_identity_result(
 uuid, uuid, uuid, text, text, text, text, text, text, date, text, text, text, timestamptz, boolean
) TO service_role;

COMMIT;
