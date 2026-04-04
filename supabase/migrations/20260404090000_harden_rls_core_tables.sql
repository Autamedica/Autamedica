-- =============================================================================
-- Migration: Harden RLS on 5 core tables (patients, doctors, appointments,
-- companies, medical_records)
--
-- Context: GitHub issue #65. These tables have RLS enabled (since migration
-- 20260301200000) and have per-role policies from baseline + consolidation
-- migrations, but are missing:
--   1. Explicit service_role bypass policies for backend/edge-function operations
--   2. A proper INSERT policy on medical_records after the tighter
--      medical_records_insert_authorized was dropped in 20260402170000
--
-- This migration adds service_role ALL policies and fills the INSERT gap on
-- medical_records without dropping or widening any existing user-facing policy.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Service-role bypass policies
--    Edge functions and backend operations use service_role. Without an explicit
--    policy, they would be blocked by RLS (Supabase does NOT auto-bypass for
--    service_role when RLS is enabled unless a policy grants it).
-- ─────────────────────────────────────────────────────────────────────────────

-- patients
DROP POLICY IF EXISTS "patients_service_role_all" ON public.patients;
CREATE POLICY "patients_service_role_all"
  ON public.patients
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- doctors
DROP POLICY IF EXISTS "doctors_service_role_all" ON public.doctors;
CREATE POLICY "doctors_service_role_all"
  ON public.doctors
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- appointments
DROP POLICY IF EXISTS "appointments_service_role_all" ON public.appointments;
CREATE POLICY "appointments_service_role_all"
  ON public.appointments
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- companies
DROP POLICY IF EXISTS "companies_service_role_all" ON public.companies;
CREATE POLICY "companies_service_role_all"
  ON public.companies
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- medical_records
DROP POLICY IF EXISTS "medical_records_service_role_all" ON public.medical_records;
CREATE POLICY "medical_records_service_role_all"
  ON public.medical_records
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) medical_records: restore proper INSERT policy for doctors
--    The baseline had two INSERT policies:
--      - medical_records_insert_policy (loose: any doctor/admin role can insert)
--      - medical_records_insert_authorized (tight: doctor must have patient access)
--    Consolidation 20260402170000 dropped medical_records_insert_authorized
--    but left medical_records_insert_policy which uses a loose profile-role check.
--    Replace the loose policy with a single tight one.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "medical_records_insert_policy" ON public.medical_records;

CREATE POLICY "medical_records_insert_doctor"
  ON public.medical_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (
      -- Doctor who created the record
      (
        public.is_doctor()
        AND EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = medical_records.patient_id
            AND public.doctor_has_patient_access(p.user_id)
        )
      )
      -- System admin
      OR public.is_system_admin()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) medical_records: restore soft-delete UPDATE policy for doctors
--    The baseline had medical_records_delete_policy (an UPDATE policy that
--    allowed setting deleted_at). It was dropped in 20260402170000.
--    medical_records_update_authorized still exists (doctor who owns the record
--    or admin can update), but it doesn't enforce the soft-delete pattern.
--    Add a dedicated soft-delete policy.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "medical_records_soft_delete" ON public.medical_records;
CREATE POLICY "medical_records_soft_delete"
  ON public.medical_records
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.doctors d
        WHERE d.id = medical_records.doctor_id
          AND d.user_id = (SELECT auth.uid())
      )
      OR public.is_system_admin()
    )
  )
  WITH CHECK (
    deleted_at IS NOT NULL
  );

COMMIT;
