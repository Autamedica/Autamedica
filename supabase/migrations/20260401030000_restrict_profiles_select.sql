-- Migration: Restrict profiles SELECT policy
-- Date: 2026-04-01
-- Issue: profiles_select_all policy allowed any authenticated user to read ALL profiles
-- Fix: Restrict to own profile + necessary cross-role access

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

-- Create restricted policy: users can only see their own profile
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Doctors can see patient profiles they have appointments with
CREATE POLICY "profiles_select_doctor_patients" ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.doctor_id = d.id
        AND a.patient_id = profiles.id
      )
    )
  );

-- Company admins can see profiles of patients in their company
CREATE POLICY "profiles_select_company_patients" ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = profiles.id
      AND p.company_id IN (
        SELECT c.id FROM public.companies c
        WHERE c.admin_user_id = auth.uid()
      )
    )
  );

-- Platform admins can see all profiles
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('organization_admin', 'platform_admin', 'admin')
    )
  );
