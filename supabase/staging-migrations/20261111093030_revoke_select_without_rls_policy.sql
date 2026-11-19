-- Remove SELECT grants that have no applicable RLS SELECT policy.
-- This preserves every anon/authenticated read path that has an explicit policy.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind='r'
      AND c.relrowsecurity
      AND has_table_privilege('anon',c.oid,'SELECT')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname='public'
          AND p.tablename=c.relname
          AND p.cmd IN ('SELECT','ALL')
          AND ('anon'=ANY(p.roles) OR 'public'=ANY(p.roles))
      )
  LOOP
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM anon',r.relname);
  END LOOP;

  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind='r'
      AND c.relrowsecurity
      AND has_table_privilege('authenticated',c.oid,'SELECT')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname='public'
          AND p.tablename=c.relname
          AND p.cmd IN ('SELECT','ALL')
          AND ('authenticated'=ANY(p.roles) OR 'public'=ANY(p.roles))
      )
  LOOP
    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM authenticated',r.relname);
  END LOOP;
END $$;
