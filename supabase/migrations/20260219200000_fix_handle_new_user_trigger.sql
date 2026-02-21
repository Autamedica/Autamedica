-- Fix: handle_new_user trigger fails for new OAuth users
--
-- Root cause: Multiple migration conflicts:
--   1. Migration 20250929090001 created `role text NOT NULL` but
--      migration 20250930_simplified_role_system replaced handle_new_user()
--      without inserting `role`, causing a NOT NULL violation.
--   2. The trigger referenced columns (`email`, `external_id`) that may not
--      exist on the live `profiles` table (original CREATE TABLE only had
--      user_id, role, created_at, updated_at).
--
-- Fix strategy: ensure all referenced columns exist, make role nullable,
-- and create a minimal trigger that only inserts the auth user identifier (safest).

BEGIN;

-- 1) Ensure `email` column exists (original CREATE TABLE omitted it)
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN email text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 2) Ensure `external_id` column exists (referenced by some migrations)
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN external_id text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 3) Make role, email, external_id nullable so the trigger can insert
--    with only the auth user identifier (role is selected in onboarding via set_user_role() RPC;
--    email/external_id may not be available at trigger time for all providers)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN role DROP NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'external_id'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN external_id DROP NOT NULL;
  END IF;
END $$;

-- Drop old text check constraint if it exists (replaced by user_role enum)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 4) Fix handle_new_user() — insert ONLY the auth user identifier.
--    - created_at / updated_at have DEFAULT now()
--    - numeric_id is filled by BEFORE INSERT trigger (ensure_numeric_id)
--    - role is NULL (set later via set_user_role() RPC)
--    - email / external_id are optional
--
--    We use a DO NOTHING on conflict so re-login of existing users is safe.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  identifier_column text;
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
    RAISE EXCEPTION 'profiles table does not contain user_id or id column';
  END IF;

  EXECUTE format(
    'INSERT INTO public.profiles (%I) VALUES ($1) ON CONFLICT (%I) DO NOTHING',
    identifier_column,
    identifier_column
  )
  USING NEW.id;

  RETURN new;
END;
$$;

-- 5) Recreate trigger (ensure it's attached correctly)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;
