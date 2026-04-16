-- ============================================================
-- Migration: Fix get_my_doctor_id bug
-- Date: 2026-04-15
-- Purpose: Correct get_my_doctor_id to query doctors table instead of patients
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_doctor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT id FROM public.doctors WHERE user_id = auth.uid() AND active = true LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_doctor_id() IS 'Returns doctor record ID for current user, correctly querying the doctors table.';
