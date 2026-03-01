-- Fix audit_profile_changes: remove references to non-existent 'portal' column and use 'user_id' instead of 'id'
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO public.auth_audit(user_id, event, data)
    VALUES (
      NEW.user_id,
      'role_changed',
      jsonb_build_object(
        'from', OLD.role,
        'to', NEW.role
      )
    );
  END IF;

  NEW.updated_at := now();

  RETURN NEW;
END;
$func$;

-- Fix handle_new_user: also create role-specific records (doctors/patients/companies)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  identifier_column text;
  role_raw text;
  role_value text;
  columns_sql text;
  values_sql text;
  insert_sql text;
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
    ) THEN 'user_id'
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
    ) THEN 'id'
    ELSE NULL
  END INTO identifier_column;

  IF identifier_column IS NULL THEN
    RAISE WARNING 'handle_new_user skipped: public.profiles has no user_id/id column';
    RETURN NEW;
  END IF;

  role_raw := lower(trim(COALESCE(NEW.raw_user_meta_data ->> 'role', '')));
  role_value := CASE role_raw
    WHEN 'doctor' THEN 'doctor'
    WHEN 'company' THEN 'company'
    WHEN 'admin' THEN 'admin'
    WHEN 'platform_admin' THEN 'admin'
    WHEN 'organization_admin' THEN 'admin'
    WHEN 'company_admin' THEN 'admin'
    ELSE 'patient'
  END;

  -- Build dynamic profile insert
  columns_sql := format('%I', identifier_column);
  values_sql := format('%L', NEW.id::text);

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email') THEN
    columns_sql := columns_sql || ', email';
    values_sql := values_sql || format(', %L', NEW.email);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') THEN
    columns_sql := columns_sql || ', role';
    values_sql := values_sql || format(', %L', role_value);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'external_id') THEN
    columns_sql := columns_sql || ', external_id';
    values_sql := values_sql || format(', %L', COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'external_id', ''), NEW.id::text));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'first_name') THEN
    columns_sql := columns_sql || ', first_name';
    values_sql := values_sql || format(', %L', NULLIF(NEW.raw_user_meta_data ->> 'first_name', ''));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_name') THEN
    columns_sql := columns_sql || ', last_name';
    values_sql := values_sql || format(', %L', NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active') THEN
    columns_sql := columns_sql || ', active';
    values_sql := values_sql || ', true';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_at') THEN
    columns_sql := columns_sql || ', created_at';
    values_sql := values_sql || ', now()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at') THEN
    columns_sql := columns_sql || ', updated_at';
    values_sql := values_sql || ', now()';
  END IF;

  insert_sql := format(
    'INSERT INTO public.profiles (%s) VALUES (%s) ON CONFLICT (%I) DO NOTHING',
    columns_sql, values_sql, identifier_column
  );

  BEGIN
    EXECUTE insert_sql;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user profile insert failed for user %: %', NEW.id, SQLERRM;
  END;

  -- Create role-specific record
  BEGIN
    CASE role_value
      WHEN 'doctor' THEN
        INSERT INTO public.doctors (user_id, license_number, specialty)
        VALUES (NEW.id, 'PENDING', 'General')
        ON CONFLICT DO NOTHING;
      WHEN 'company' THEN
        INSERT INTO public.companies (user_id)
        VALUES (NEW.id)
        ON CONFLICT DO NOTHING;
      ELSE
        INSERT INTO public.patients (user_id)
        VALUES (NEW.id)
        ON CONFLICT DO NOTHING;
    END CASE;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'handle_new_user role record failed for user % (role %): %', NEW.id, role_value, SQLERRM;
  END;

  RETURN NEW;
END;
$func$;
