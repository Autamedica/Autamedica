-- ============================================================
-- Migration: Fix Guest Appointment RLS
-- Date: 2026-04-15
-- Purpose: Allow doctors to create appointments with NULL patient_id
-- ============================================================

-- 1. Actualizar política de INSERT para citas
DROP POLICY IF EXISTS "appointments_insert_authorized" ON public.appointments;
CREATE POLICY "appointments_insert_authorized" ON public.appointments
  FOR INSERT
  WITH CHECK (
    -- Caso Paciente: Debe ser para sí mismo
    (public.is_patient() AND patient_id = public.get_my_patient_id())
    OR 
    -- Caso Doctor: Puede ser para un paciente con acceso O para un invitado (null patient_id)
    (public.is_doctor() AND (
      patient_id IS NULL 
      OR 
      public.doctor_has_patient_access(
        (SELECT user_id FROM public.patients WHERE id = patient_id LIMIT 1)
      )
    ))
    OR public.is_system_admin()
  );

-- 2. Asegurar política de UPDATE (para cambios de estado o notas en invitados)
DROP POLICY IF EXISTS "appointments_update_participants" ON public.appointments;
CREATE POLICY "appointments_update_participants" ON public.appointments
  FOR UPDATE
  USING (
    patient_id = public.get_my_patient_id()
    OR doctor_id = public.get_my_doctor_id()
    OR public.is_system_admin()
  );

COMMENT ON POLICY "appointments_insert_authorized" ON public.appointments IS 'Allows insertion by participants, including guest appointments by doctors.';
