-- Ensure auth signup never fails due to profile sync drift.
-- This migration makes profile creation best-effort across schema variants.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  identifier_column text;
  role_raw text;
  role_value text;
  portal_value text;
  columns_sql text;
  values_sql text;
  insert_sql text;
BEGIN
  -- Detect whether profiles is keyed by user_id (current) or id (legacy).
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'user_id'
    ) THEN 'user_id'
    WHEN EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'id'
    ) THEN 'id'
    ELSE NULL
  END
  INTO identifier_column;

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

  portal_value := CASE role_value
    WHEN 'doctor' THEN 'doctors'
    WHEN 'company' THEN 'companies'
    WHEN 'admin' THEN 'admin'
    ELSE 'patients'
  END;

  columns_sql := format('%I', identifier_column);
  values_sql := format('%L', NEW.id::text);

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) THEN
    columns_sql := columns_sql || ', email';
    values_sql := values_sql || format(', %L', NEW.email);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    columns_sql := columns_sql || ', role';
    values_sql := values_sql || format(', %L', role_value);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'portal'
  ) THEN
    columns_sql := columns_sql || ', portal';
    values_sql := values_sql || format(', %L', portal_value);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'external_id'
  ) THEN
    columns_sql := columns_sql || ', external_id';
    values_sql := values_sql || format(', %L', COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'external_id', ''), NEW.id::text));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'metadata'
  ) THEN
    columns_sql := columns_sql || ', metadata';
    values_sql := values_sql || format(', %L::jsonb', COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)::text);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active'
  ) THEN
    columns_sql := columns_sql || ', active';
    values_sql := values_sql || ', true';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_at'
  ) THEN
    columns_sql := columns_sql || ', created_at';
    values_sql := values_sql || ', now()';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at'
  ) THEN
    columns_sql := columns_sql || ', updated_at';
    values_sql := values_sql || ', now()';
  END IF;

  insert_sql := format(
    'INSERT INTO public.profiles (%s) VALUES (%s) ON CONFLICT (%I) DO NOTHING',
    columns_sql,
    values_sql,
    identifier_column
  );

  BEGIN
    EXECUTE insert_sql;
  EXCEPTION WHEN others THEN
    -- Never block auth user creation because of profile-side drift or constraints.
    RAISE WARNING 'handle_new_user profile sync skipped for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMIT;
