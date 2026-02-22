-- Harden auth signup path: never block auth.users insert because of profiles side effects.
-- This migration keeps profile creation best-effort while preserving the auth account creation flow.

BEGIN;

-- Keep sequence available for environments that require numeric_id.
CREATE SEQUENCE IF NOT EXISTS public.user_numeric_id_seq
  AS BIGINT
  START WITH 10000001
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 100;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  identifier_column text;
  role_value text;
  primary_insert_error text;
BEGIN
  SELECT
    CASE
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

  role_value := NULLIF(NEW.raw_user_meta_data ->> 'role', '');
  IF role_value IS NOT NULL
     AND role_value NOT IN (
       'patient',
       'doctor',
       'company',
       'company_admin',
       'organization_admin',
       'platform_admin',
       'admin'
     ) THEN
    role_value := NULL;
  END IF;

  -- Keep numeric_id default healthy where present.
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'numeric_id'
    ) THEN
      ALTER TABLE public.profiles
        ALTER COLUMN numeric_id SET DEFAULT nextval('public.user_numeric_id_seq');
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'handle_new_user: numeric_id default setup skipped: %', SQLERRM;
  END;

  -- Primary path: minimal insert (most portable across schema variants).
  BEGIN
    EXECUTE format(
      'INSERT INTO public.profiles (%I) VALUES ($1) ON CONFLICT (%I) DO NOTHING',
      identifier_column,
      identifier_column
    )
    USING NEW.id;
  EXCEPTION WHEN others THEN
    primary_insert_error := SQLERRM;

    -- Fallback path for stricter schemas requiring common profile columns.
    BEGIN
      EXECUTE format(
        'INSERT INTO public.profiles (%I, email, role, external_id, created_at, updated_at) ' ||
        'VALUES ($1, $2, $3, $4, now(), now()) ON CONFLICT (%I) DO NOTHING',
        identifier_column,
        identifier_column
      )
      USING NEW.id, NEW.email, role_value, NEW.id::text;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'handle_new_user fallback failed for user % (primary: %, fallback: %)',
        NEW.id, primary_insert_error, SQLERRM;
    END;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;
