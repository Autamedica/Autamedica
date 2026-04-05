-- Add timezone column to doctors and patients tables.
-- Default: Argentina Standard Time (the platform's primary market).
-- IANA timezone identifier, validated by PostgreSQL's pg_timezone_names.

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';

COMMENT ON COLUMN public.doctors.timezone IS 'IANA timezone of the doctor (e.g. America/Argentina/Buenos_Aires)';
COMMENT ON COLUMN public.patients.timezone IS 'IANA timezone of the patient (e.g. America/Argentina/Buenos_Aires)';
