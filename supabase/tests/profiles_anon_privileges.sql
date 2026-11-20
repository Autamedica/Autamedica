BEGIN;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.profiles', 'SELECT')
     OR has_table_privilege('anon', 'public.profiles', 'INSERT')
     OR has_table_privilege('anon', 'public.profiles', 'UPDATE')
     OR has_table_privilege('anon', 'public.profiles', 'DELETE') THEN
    RAISE EXCEPTION 'anon must not retain table privileges on public.profiles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'anon must not retain column privileges on public.profiles';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND 'anon'::name = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'anon must not have an RLS policy on public.profiles';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated profile reads must remain available';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_select_doctors_public'
      AND 'authenticated'::name = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'authenticated doctor-directory policy must remain available';
  END IF;
END;
$$;

ROLLBACK;
