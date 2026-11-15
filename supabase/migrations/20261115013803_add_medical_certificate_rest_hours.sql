-- Supports clinical leave intervals expressed in hours without conflating them with calendar days.
ALTER TABLE public.medical_certificates
  ADD COLUMN IF NOT EXISTS rest_hours integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.medical_certificates'::regclass
      AND conname = 'medical_certificates_rest_hours_range_check'
  ) THEN
    ALTER TABLE public.medical_certificates
      ADD CONSTRAINT medical_certificates_rest_hours_range_check
      CHECK (rest_hours BETWEEN 0 AND 8760);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.medical_certificates'::regclass
      AND conname = 'medical_certificates_rest_period_unit_check'
  ) THEN
    ALTER TABLE public.medical_certificates
      ADD CONSTRAINT medical_certificates_rest_period_unit_check
      CHECK (rest_hours = 0 OR (days_of_rest = 0 AND end_date IS NULL));
  END IF;
END;
$$;

COMMENT ON COLUMN public.medical_certificates.rest_hours IS
  'Clinical leave duration in hours. Mutually exclusive with days_of_rest; zero means not expressed in hours.';
