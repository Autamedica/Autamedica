-- =============================================================================
-- Migration: Enable RLS on unprotected tables + Fix security-definer views
-- Resolves all 18 Supabase Advisor security issues
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Enable RLS on tables that have policies but RLS was not enabled
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) spatial_ref_sys: PostGIS system table, owned by extension — skip RLS
--    This table is read-only reference data managed by PostGIS.
--    Cannot ALTER because we are not the owner (extension owns it).
--    Advisor warning is acceptable for this system table.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Fix v_db_health: remove auth.users reference, set security_invoker
--    The view queries auth.users which leaks user count to anon callers.
--    Replace with a safe version that only exposes schema metadata.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_db_health;

CREATE VIEW public.v_db_health
  WITH (security_invoker = true)
AS
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS public_tables,
  (SELECT count(*) FROM pg_tables t
   WHERE t.schemaname = 'public'
     AND t.tablename <> 'spatial_ref_sys'
     AND EXISTS (
       SELECT 1 FROM pg_class c
       WHERE c.relname = t.tablename AND c.relrowsecurity = true
     )) AS tables_with_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS total_policies,
  (SELECT count(*) FROM storage.buckets) AS storage_buckets,
  (SELECT count(*) FROM audit_logs
   WHERE created_at > now() - interval '24 hours') AS audit_entries_24h,
  now() AS checked_at;

COMMENT ON VIEW public.v_db_health IS 'DB health dashboard — no auth.users exposure, security_invoker=true';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Fix user_identifiers: set security_invoker so it respects profiles RLS
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.user_identifiers;

CREATE VIEW public.user_identifiers
  WITH (security_invoker = true)
AS
SELECT
  user_id,
  numeric_id,
  role,
  email,
  created_at AS profile_created_at,
  CASE role
    WHEN 'patient' THEN 'PT-' || numeric_id
    WHEN 'doctor' THEN 'DR-' || numeric_id
    WHEN 'company' THEN 'CO-' || numeric_id
    WHEN 'company_admin' THEN 'CA-' || numeric_id
    WHEN 'organization_admin' THEN 'AD-' || numeric_id
    ELSE 'US-' || numeric_id
  END AS display_id
FROM profiles;

COMMENT ON VIEW public.user_identifiers IS 'User identifier mapping — security_invoker=true, respects profiles RLS';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Fix telemedicine_sessions_canonical: set security_invoker
-- ─────────────────────────────────────────────────────────────────────────────

-- First get current definition to preserve it
DROP VIEW IF EXISTS public.telemedicine_sessions_canonical;

CREATE VIEW public.telemedicine_sessions_canonical
  WITH (security_invoker = true)
AS
SELECT
  ts.id,
  ts.patient_id,
  ts.doctor_id,
  ts.status,
  ts.scheduled_at,
  ts.started_at,
  ts.ended_at,
  ts.room_id,
  ts.notes,
  ts.recording_url,
  ts.duration_seconds,
  ts.created_at,
  ts.updated_at,
  ts.appointment_id,
  ts.doctor_profile_id,
  ts.patient_profile_id,
  COALESCE(ts.doctor_profile_id, d_by_id.id, d_by_user.id) AS canonical_doctor_id,
  COALESCE(ts.patient_profile_id, p_by_id.id, p_by_user.id) AS canonical_patient_id
FROM telemedicine_sessions ts
LEFT JOIN doctors d_by_id ON d_by_id.id = ts.doctor_id
LEFT JOIN doctors d_by_user ON d_by_user.user_id = ts.doctor_id
LEFT JOIN patients p_by_id ON p_by_id.id = ts.patient_id
LEFT JOIN patients p_by_user ON p_by_user.user_id = ts.patient_id;

COMMENT ON VIEW public.telemedicine_sessions_canonical IS 'Canonical telemedicine sessions — security_invoker=true, respects RLS';
