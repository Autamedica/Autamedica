-- Drop orphaned tables that have ZERO references in application code, edge functions, or active triggers.
--
-- Methodology: grepped the entire codebase (apps/, packages/, supabase/functions/) for each table name.
-- Only tables whose sole references are in migrations, database.types.ts, docs, or archive are dropped.
--
-- Tables being dropped:
--   1. consultation_rooms        — LiveKit rooms superseded by telemedicine_sessions + calls system
--   2. medical_audit_log         — Superseded by audit_logs; log_medical_access() is dead code
--   3. medical_cases             — Educational preventive care cases, never consumed by any frontend
--   4. screening_reminder_notifications — Notification system never wired to any app code
--   5. patient_risk_factors      — Risk factor assignments, no queries from app code
--   6. risk_factors              — Risk factor catalog, only referenced by patient_risk_factors (also dropped)
--   7. telemedicine_session_events — Session event log, no app code writes or reads this table
--
-- Associated functions being dropped:
--   - update_consultation_rooms_updated_at()  — trigger function only used by consultation_rooms
--   - log_medical_access()                    — RPC that writes to medical_audit_log, never called
--
-- Drop order respects foreign key dependencies:
--   - patient_risk_factors before risk_factors (FK with ON DELETE RESTRICT)
--   - screening_reminder_notifications before patient_screenings (FK, but patient_screenings is kept)
--   - telemedicine_session_events before telemedicine_sessions (FK, but telemedicine_sessions is kept)

BEGIN;

-- 1. Drop functions that depend on tables being removed
DROP FUNCTION IF EXISTS public.update_consultation_rooms_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.log_medical_access(text, text, uuid, uuid) CASCADE;

-- 2. Drop child tables first (FK dependencies)
DROP TABLE IF EXISTS public.patient_risk_factors CASCADE;
DROP TABLE IF EXISTS public.screening_reminder_notifications CASCADE;
DROP TABLE IF EXISTS public.telemedicine_session_events CASCADE;

-- 3. Drop parent/independent tables
DROP TABLE IF EXISTS public.risk_factors CASCADE;
DROP TABLE IF EXISTS public.consultation_rooms CASCADE;
DROP TABLE IF EXISTS public.medical_audit_log CASCADE;
DROP TABLE IF EXISTS public.medical_cases CASCADE;

COMMIT;
