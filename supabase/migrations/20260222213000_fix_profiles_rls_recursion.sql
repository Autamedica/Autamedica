-- Fix profiles RLS recursion and normalize policies across legacy schemas.
-- Context:
-- - Some environments created recursive policies that query public.profiles from a
--   policy on public.profiles, causing: "infinite recursion detected in policy".
-- - This migration replaces those policies with non-recursive policies and uses
--   a SECURITY DEFINER helper for admin checks.

BEGIN;

-- 1) Admin helper (non-recursive in policy usage)
CREATE OR REPLACE FUNCTION public.is_platform_or_org_admin(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  identifier_column text;
  current_role text;
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;

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
    RETURN false;
  END IF;

  EXECUTE format(
    'SELECT role::text FROM public.profiles WHERE %I = $1 LIMIT 1',
    identifier_column
  )
  INTO current_role
  USING p_uid;

  RETURN current_role IN ('platform_admin', 'organization_admin', 'admin');
END;
$$;

REVOKE ALL ON FUNCTION public.is_platform_or_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_or_org_admin(uuid) TO authenticated;

-- 2) Replace recursive/legacy policies with safe versions
DO $$
DECLARE
  identifier_column text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
  ) THEN
    RAISE NOTICE 'profiles table not found, skipping policy recreation';
    RETURN;
  END IF;

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
    RAISE EXCEPTION 'profiles table has no user_id or id column';
  END IF;

  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  -- Drop legacy policies (safe if they do not exist)
  DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
  DROP POLICY IF EXISTS "read_own_profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  DROP POLICY IF EXISTS "update_own_profile_safe" ON public.profiles;
  DROP POLICY IF EXISTS "Enable profile creation" ON public.profiles;
  DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
  DROP POLICY IF EXISTS "Platform admins can view all profiles" ON public.profiles;
  DROP POLICY IF EXISTS "admin_read_all_profiles" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;

  -- Drop normalized names too (idempotent reruns)
  DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
  DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;

  -- Recreate non-recursive policies
  EXECUTE format(
    'CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT USING (%I = auth.uid())',
    identifier_column
  );

  EXECUTE format(
    'CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE USING (%I = auth.uid()) WITH CHECK (%I = auth.uid())',
    identifier_column,
    identifier_column
  );

  EXECUTE format(
    'CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT WITH CHECK (%I = auth.uid())',
    identifier_column
  );

  CREATE POLICY "profiles_select_admin"
    ON public.profiles FOR SELECT
    USING (public.is_platform_or_org_admin(auth.uid()));
END $$;

COMMIT;
