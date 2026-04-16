-- ============================================================
-- Migration: Complete Guest Appointment Fix
-- Date: 2026-04-15
-- Purpose: Support NULL patient_id (guests) in all related triggers and tables
-- ============================================================

-- 1. Ensure doctor_patient link only happens for real patients
CREATE OR REPLACE FUNCTION public.ensure_doctor_patient_relationship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo insertar relación si hay un paciente real vinculado (no invitado externo)
  IF NEW.patient_id IS NOT NULL THEN
    INSERT INTO public.doctor_patient (doctor_id, patient_id)
    VALUES (NEW.doctor_id, NEW.patient_id)
    ON CONFLICT (doctor_id, patient_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Make patient_id nullable in appointment_history
-- This is necessary because appointment_history.patient_id was NOT NULL
ALTER TABLE public.appointment_history ALTER COLUMN patient_id DROP NOT NULL;

-- 3. Update log_appointment_change to handle NULL patient_id
CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := NEW.status;
  ELSIF OLD.start_time IS DISTINCT FROM NEW.start_time THEN
    v_action := 'rescheduled';
  ELSE
    v_action := 'updated';
  END IF;

  INSERT INTO public.appointment_history (
    appointment_id, patient_id, doctor_id, action, old_status, new_status, metadata
  ) VALUES (
    NEW.id,
    NEW.patient_id,
    NEW.doctor_id,
    v_action,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    jsonb_build_object(
      'trigger_op', TG_OP,
      'old_start_time', CASE WHEN TG_OP = 'UPDATE' THEN OLD.start_time::text ELSE NULL END,
      'new_start_time', NEW.start_time::text
    )
  );

  RETURN NEW;
END;
$$;

-- 4. Skip automated reminders for guest appointments (null patient_id)
-- Since we don't have a phone number for guest reminders currently
CREATE OR REPLACE FUNCTION public.trg_schedule_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Solo programar recordatorios si hay un paciente real vinculado
  IF NEW.patient_id IS NOT NULL THEN
    PERFORM public.schedule_appointment_reminders(NEW.id, 'whatsapp');
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.log_appointment_change() IS 'Logs changes to appointments, now supporting NULL patient_id for guests.';
COMMENT ON FUNCTION public.trg_schedule_appointment_reminders() IS 'Schedules reminders only for real patients, skipping guests with NULL patient_id.';
