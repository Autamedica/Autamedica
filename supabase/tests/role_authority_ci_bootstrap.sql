-- Disposable PostgreSQL CI bootstrap for role guard regression tests.
-- NEVER run this file against an existing Supabase project or production database.
-- The GitHub workflow runs it only against a freshly created local postgres:16 service.
CREATE SCHEMA IF NOT EXISTS auth;
DO $roles$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
   CREATE ROLE anon NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   CREATE ROLE authenticated NOLOGIN;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
   CREATE ROLE service_role NOLOGIN;
 END IF;
END;
$roles$;

CREATE TYPE public.user_role AS ENUM (
  'patient', 'doctor', 'pharmacist', 'company_admin', 'platform_admin'
);
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY,
  role public.user_role NOT NULL DEFAULT 'patient'
);
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
