-- Immutable booking provenance and audit fields must not be client-editable.
-- Direct authenticated users can otherwise set created_by to a doctor's user_id
-- and skip payment checks in downstream appointment/join workflows.
-- Preserve trusted service_role and DB-owned jobs.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

CREATE OR REPLACE FUNCTION public.enforce_appointment_metadata_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $metadata$
BEGIN
  IF current_user = 'authenticated' AND (
    NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.referral_sent IS DISTINCT FROM OLD.referral_sent
  ) THEN
    RAISE EXCEPTION 'appointment_provenance_fields_immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$metadata$;

DROP TRIGGER IF EXISTS trg_appointment_metadata_immutable ON public.appointments;
CREATE TRIGGER trg_appointment_metadata_immutable
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_appointment_metadata_immutable();

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.appointments'::regclass
      AND tgname='trg_appointment_metadata_immutable' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Appointment provenance trigger missing';
  END IF;
  IF (SELECT prosecdef FROM pg_proc
      WHERE oid='public.enforce_appointment_metadata_immutable()'::regprocedure)
  THEN
    RAISE EXCEPTION 'Appointment metadata guard must run as SECURITY INVOKER';
  END IF;
END;
$verify$;
