-- Prevent unverified doctor self-registration from granting clinical access.
-- DRAFT / TEST FIRST. New automated doctor rows stay inactive; existing rows untouched.
-- Source routines preserved from live schema with only activation fields changed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  role_raw   text;
  role_value public.user_role;
  cols_sql   text := 'user_id, email, role, first_name, last_name';
  values_sql text;
BEGIN
  role_raw := COALESCE(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_user_meta_data ->> 'user_role',
    'patient'
  );

  role_value := CASE role_raw
    WHEN 'doctor'     THEN 'doctor'::public.user_role
    WHEN 'pharmacist' THEN 'pharmacist'::public.user_role
    WHEN 'company'    THEN 'company_admin'::public.user_role
    WHEN 'admin'      THEN 'platform_admin'::public.user_role
    ELSE 'patient'::public.user_role
  END;

  values_sql := format(
    '%L, %L, %L, %L, %L',
    NEW.id,
    COALESCE(NEW.email, NEW.raw_user_meta_data ->> 'email'),
    role_value,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
  );

  IF NEW.raw_user_meta_data ? 'phone' THEN
    cols_sql   := cols_sql || ', phone';
    values_sql := values_sql || format(', %L', NULLIF(NEW.raw_user_meta_data ->> 'phone', ''));
  END IF;

  EXECUTE format(
    'INSERT INTO public.profiles (%s) VALUES (%s) ON CONFLICT (user_id) DO NOTHING',
    cols_sql, values_sql
  );

  CASE role_value
    WHEN 'doctor' THEN
      INSERT INTO public.doctors (user_id, license_number, specialty, active)
      VALUES (NEW.id, 'PENDING', 'General', false)
      ON CONFLICT DO NOTHING;

    WHEN 'patient' THEN
      INSERT INTO public.patients (user_id)
      VALUES (NEW.id)
      ON CONFLICT DO NOTHING;

    WHEN 'pharmacist' THEN
      INSERT INTO public.pharmacists (user_id)
      VALUES (NEW.id)
      ON CONFLICT DO NOTHING;

    WHEN 'company_admin' THEN
      NULL;

    WHEN 'platform_admin' THEN
      NULL;

    ELSE
      INSERT INTO public.patients (user_id)
      VALUES (NEW.id)
      ON CONFLICT DO NOTHING;
  END CASE;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.ensure_role_specific_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      false,
      '["Spanish"]'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.guard_provisional_doctor_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $guard$
BEGIN
  -- Pending credentials cannot activate a clinical professional account.
  -- Do not retroactively mutate existing doctors in this migration.
  IF NEW.active IS TRUE
     AND pg_catalog.upper(pg_catalog.btrim(NEW.license_number))
         OPERATOR(pg_catalog.~) '^PENDING(-|$)'
  THEN
    NEW.active := false;
  END IF;

  -- End users must never approve themselves or edit authoritative license numbers.
  IF current_user IN ('anon','authenticated')
     AND TG_OP = 'UPDATE'
     AND (
       NEW.active IS DISTINCT FROM OLD.active
       OR NEW.license_number IS DISTINCT FROM OLD.license_number
     )
  THEN
    RAISE EXCEPTION 'Doctor activation and license verification require trusted provisioning'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS guard_provisional_doctor_activation ON public.doctors;
CREATE TRIGGER guard_provisional_doctor_activation
BEFORE INSERT OR UPDATE OF active, license_number ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.guard_provisional_doctor_activation();

REVOKE ALL ON FUNCTION public.guard_provisional_doctor_activation() FROM PUBLIC, anon, authenticated;
