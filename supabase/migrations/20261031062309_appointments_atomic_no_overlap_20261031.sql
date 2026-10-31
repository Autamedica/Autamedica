-- Applied to Supabase production as migration 20261031062309_appointments_atomic_no_overlap_20261031. Do not reapply.
-- Prevent concurrent writes from double-booking the same physician.
-- The existing BEFORE trigger check_appointment_conflict() is not atomic:
-- two concurrent transactions can both see "no existing appointment".
-- PostgreSQL exclusion constraints serialize conflicting GiST index writes.
SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $booking$
DECLARE v_invalid bigint;
BEGIN
  IF to_regclass('public.appointments') IS NULL
    OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.appointments'::regclass AND conname='appointments_doctor_no_overlap')
  THEN
    RAISE EXCEPTION 'Unexpected appointment table or duplicate constraint';
  END IF;

  SELECT count(*) INTO v_invalid FROM public.appointments
  WHERE doctor_id IS NOT NULL AND status NOT IN ('cancelled','no_show')
    AND (end_time IS NULL OR end_time <= start_time);
  IF v_invalid <> 0 THEN
    RAISE EXCEPTION 'Invalid active appointment intervals; cannot safely enforce exclusion';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.appointments a JOIN public.appointments b
      ON a.id < b.id AND a.doctor_id=b.doctor_id AND a.doctor_id IS NOT NULL
      AND tstzrange(a.start_time,a.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')
    WHERE a.status NOT IN ('cancelled','no_show')
      AND b.status NOT IN ('cancelled','no_show')
  ) THEN
    RAISE EXCEPTION 'Preexisting overlapping appointment intervals';
  END IF;

  EXECUTE 'ALTER TABLE public.appointments ADD CONSTRAINT appointments_doctor_no_overlap EXCLUDE USING gist (doctor_id WITH =, tstzrange(start_time, end_time, ''[)'') WITH &&) WHERE (doctor_id IS NOT NULL AND status NOT IN (''cancelled'', ''no_show''))';

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.appointments'::regclass
      AND conname='appointments_doctor_no_overlap'
      AND contype='x' AND convalidated
  ) THEN
    RAISE EXCEPTION 'Exclusion constraint was not installed';
  END IF;
END;
$booking$;
