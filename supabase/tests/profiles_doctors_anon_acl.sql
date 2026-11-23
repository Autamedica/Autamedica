-- Binary regression test for anonymous ACL lockdown on identity tables.
BEGIN;
DO $test$
BEGIN
  IF has_table_privilege('anon','public.profiles','SELECT')
     OR has_table_privilege('anon','public.profiles','INSERT')
     OR has_table_privilege('anon','public.profiles','UPDATE')
     OR has_table_privilege('anon','public.profiles','DELETE') THEN
    RAISE EXCEPTION 'anon retains a direct privilege on public.profiles';
  END IF;
  IF has_table_privilege('anon','public.doctors','SELECT')
     OR has_table_privilege('anon','public.doctors','INSERT')
     OR has_table_privilege('anon','public.doctors','UPDATE')
     OR has_table_privilege('anon','public.doctors','DELETE') THEN
    RAISE EXCEPTION 'anon retains a direct privilege on public.doctors';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('profiles','doctors')
      AND 'anon'=ANY(roles)
      AND cmd IN ('SELECT','INSERT','UPDATE','DELETE','ALL')
  ) THEN
    RAISE EXCEPTION 'anon retains a permissive policy on profiles/doctors';
  END IF;
  IF NOT has_table_privilege('authenticated','public.profiles','SELECT')
     OR NOT has_table_privilege('authenticated','public.doctors','SELECT') THEN
    RAISE EXCEPTION 'authenticated read access was unexpectedly removed';
  END IF;
END;
$test$;
ROLLBACK;
