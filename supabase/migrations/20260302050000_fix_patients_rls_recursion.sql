-- Fix infinite recursion in patients RLS policies.
-- The appointments policies query patients, which triggers patients_select_restricted,
-- which calls doctor_has_patient_access() which queries patients again → infinite recursion.
--
-- Fix:
-- 1. Create SECURITY DEFINER helpers to get user's patient/doctor IDs without triggering RLS
-- 2. Replace appointment policies to use helpers instead of subqueries on patients/doctors
-- 3. Drop patients_select_restricted (causes recursion) and replace with simpler policies

-- ============================================================
-- Step 1: Create SECURITY DEFINER helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_patient_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id FROM public.patients WHERE user_id = auth.uid() AND active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_doctor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id FROM public.doctors WHERE user_id = auth.uid() AND active = true LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_patient_id() IS 'Returns patient record ID for current user, bypasses RLS';
COMMENT ON FUNCTION public.get_my_doctor_id() IS 'Returns doctor record ID for current user, bypasses RLS';

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_patient_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_doctor_id() TO authenticated;

-- ============================================================
-- Step 2: Fix appointments SELECT policies
-- ============================================================

-- Drop all overlapping SELECT policies on appointments
DROP POLICY IF EXISTS "Patients can view own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Doctors can view their appointments" ON public.appointments;
DROP POLICY IF EXISTS "appointments_select_participants" ON public.appointments;

-- Create single clean SELECT policy using helpers (no subqueries on patients/doctors)
CREATE POLICY "appointments_select_participants" ON public.appointments
  FOR SELECT
  USING (
    patient_id = public.get_my_patient_id()
    OR doctor_id = public.get_my_doctor_id()
    OR public.is_system_admin()
  );

-- Fix DELETE policy
DROP POLICY IF EXISTS "appointments_delete_participants" ON public.appointments;
CREATE POLICY "appointments_delete_participants" ON public.appointments
  FOR DELETE
  USING (
    patient_id = public.get_my_patient_id()
    OR doctor_id = public.get_my_doctor_id()
    OR public.is_system_admin()
  );

-- Fix UPDATE policy
DROP POLICY IF EXISTS "appointments_update_participants" ON public.appointments;
CREATE POLICY "appointments_update_participants" ON public.appointments
  FOR UPDATE
  USING (
    patient_id = public.get_my_patient_id()
    OR doctor_id = public.get_my_doctor_id()
    OR public.is_system_admin()
  );

-- Fix INSERT policy
DROP POLICY IF EXISTS "appointments_insert_authorized" ON public.appointments;
CREATE POLICY "appointments_insert_authorized" ON public.appointments
  FOR INSERT
  WITH CHECK (
    (public.is_patient() AND patient_id = public.get_my_patient_id())
    OR (public.is_doctor() AND public.doctor_has_patient_access(
      (SELECT user_id FROM public.patients WHERE id = patient_id LIMIT 1)
    ))
    OR public.is_system_admin()
  );

-- ============================================================
-- Step 3: Fix patients SELECT policies (remove recursive one)
-- ============================================================

-- Drop the recursive policy
DROP POLICY IF EXISTS "patients_select_restricted" ON public.patients;

-- The remaining policies cover all cases:
-- "Patients can view own profile" → user_id = auth.uid() (already exists)
-- "Doctors can view assigned patients" → via patient_care_team join (already exists)

-- Add admin and company access (these functions are SECURITY DEFINER, no recursion)
CREATE POLICY "patients_select_admin" ON public.patients
  FOR SELECT
  USING (public.is_system_admin());

CREATE POLICY "patients_select_company" ON public.patients
  FOR SELECT
  USING (
    public.is_company_admin()
    AND organization_id IS NOT NULL
    AND public.user_belongs_to_company(organization_id)
  );

-- ============================================================
-- Step 4: Fix patients UPDATE policy (also potentially recursive)
-- ============================================================

DROP POLICY IF EXISTS "patients_update_restricted" ON public.patients;

-- Keep simple self-update
-- "Users can update own profile" may already exist, but add specific one for safety
CREATE POLICY "patients_update_self" ON public.patients
  FOR UPDATE
  USING (user_id = auth.uid() AND public.is_patient());

CREATE POLICY "patients_update_admin" ON public.patients
  FOR UPDATE
  USING (public.is_system_admin());

CREATE POLICY "patients_update_doctor" ON public.patients
  FOR UPDATE
  USING (public.is_doctor() AND public.doctor_has_patient_access(user_id));
