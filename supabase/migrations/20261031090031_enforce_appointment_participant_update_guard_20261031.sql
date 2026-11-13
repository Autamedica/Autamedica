-- Production migration ledger version: 20261031090031.
-- Reconcile code with already-applied live migration. Do not reapply.
-- Guard direct authenticated client updates to public.appointments.
-- The current participant RLS UPDATE policy authorizes *rows*, but did not
-- separately authorize changes to patient_id/doctor_id or medical statuses.
-- Internal trusted DB functions / service_role keep their existing workflows.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

CREATE OR REPLACE FUNCTION public.enforce_appointment_participant_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $guard$
DECLARE
  v_patient_id uuid;
  v_doctor_id uuid;
BEGIN
  -- Scoped to direct authenticated Data API writes. Database-owned workflows
  -- and service_role run as privileged current_user and are unaffected.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'appointment_user_identity_required' USING ERRCODE='42501';
  END IF;

  IF public.is_system_admin() THEN
    RETURN NEW;
  END IF;

  -- Identity reassignment must go through the authorized backend workflow.
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
  THEN
    RAISE EXCEPTION 'appointment_participants_immutable_for_direct_clients'
      USING ERRCODE='42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_doctor_id := public.get_my_doctor_id();
    v_patient_id := public.get_my_patient_id();

    IF v_doctor_id IS NOT NULL AND OLD.doctor_id = v_doctor_id THEN
      IF NOT (
        (OLD.status = 'payment_pending' AND NEW.status IN ('confirmed','cancelled'))
        OR (OLD.status = 'scheduled' AND NEW.status IN ('confirmed','in_progress','cancelled','no_show'))
        OR (OLD.status = 'confirmed' AND NEW.status IN ('in_progress','cancelled','no_show'))
        OR (OLD.status = 'in_progress' AND NEW.status = 'completed')
      ) THEN
        RAISE EXCEPTION 'appointment_doctor_transition_not_allowed'
          USING ERRCODE='42501';
      END IF;

    ELSIF v_patient_id IS NOT NULL AND OLD.patient_id = v_patient_id THEN
      IF NOT (
        OLD.status IN ('payment_pending','scheduled','confirmed')
        AND NEW.status = 'cancelled'
      ) THEN
        RAISE EXCEPTION 'appointment_patient_transition_not_allowed'
          USING ERRCODE='42501';
      END IF;

    ELSE
      RAISE EXCEPTION 'appointment_actor_not_authorized'
        USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS trg_appointment_actor_guard ON public.appointments;
CREATE TRIGGER trg_appointment_actor_guard
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_appointment_participant_updates();

DO $invariants$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.appointments'::regclass
      AND tgname='trg_appointment_actor_guard' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Appointment actor guard not installed';
  END IF;
  IF (SELECT prosecdef FROM pg_proc
      WHERE oid='public.enforce_appointment_participant_updates()'::regprocedure)
  THEN RAISE EXCEPTION 'Appointment guard must be SECURITY INVOKER'; END IF;
END;
$invariants$;
