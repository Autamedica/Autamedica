-- Exact production migration already applied and SQL-verified on 2026-10-21.
-- PostgreSQL default ACLs had granted API clients TRUNCATE, TRIGGER and REFERENCES.
-- Restrict future *postgres-owned* public tables, retaining ordinary CRUD rights.
-- Supabase-managed supabase_admin defaults remain an unresolved exception.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;
