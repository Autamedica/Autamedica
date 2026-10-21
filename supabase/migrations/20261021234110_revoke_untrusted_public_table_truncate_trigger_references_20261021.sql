-- Mirror of a production migration applied on 2026-10-21.
-- Prevent RLS-bypassing TRUNCATE and DDL-level TRIGGER/REFERENCES for API roles.
-- The loop excludes managed schemas and preserves normal CRUD and service_role.
-- Managed extension object public.spatial_ref_sys remains an exception because
-- its privileges are granted by supabase_admin; investigate with Supabase support.
DO $harden_public_table_privileges$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
      t.nspname,t.relname
    );
  END LOOP;
END;
$harden_public_table_privileges$;
