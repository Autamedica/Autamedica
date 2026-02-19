-- Normalize telemedicine_sessions participant references without breaking legacy flows.
-- This migration is idempotent and keeps backward compatibility with existing doctor_id/patient_id usage.

DO $$
BEGIN
  IF to_regclass('public.telemedicine_sessions') IS NULL THEN
    RAISE NOTICE 'telemedicine_sessions does not exist, skipping participant normalization';
    RETURN;
  END IF;
END $$;

ALTER TABLE public.telemedicine_sessions
  ADD COLUMN IF NOT EXISTS doctor_profile_id uuid,
  ADD COLUMN IF NOT EXISTS patient_profile_id uuid;

-- Backfill canonical participant ids from either existing profile ids or auth user ids.
UPDATE public.telemedicine_sessions ts
SET doctor_profile_id = d.id
FROM public.doctors d
WHERE ts.doctor_profile_id IS NULL
  AND d.id = ts.doctor_id;

UPDATE public.telemedicine_sessions ts
SET doctor_profile_id = d.id
FROM public.doctors d
WHERE ts.doctor_profile_id IS NULL
  AND d.user_id = ts.doctor_id;

UPDATE public.telemedicine_sessions ts
SET patient_profile_id = p.id
FROM public.patients p
WHERE ts.patient_profile_id IS NULL
  AND p.id = ts.patient_id;

UPDATE public.telemedicine_sessions ts
SET patient_profile_id = p.id
FROM public.patients p
WHERE ts.patient_profile_id IS NULL
  AND p.user_id = ts.patient_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telemedicine_sessions_doctor_profile_fk'
  ) THEN
    ALTER TABLE public.telemedicine_sessions
      ADD CONSTRAINT telemedicine_sessions_doctor_profile_fk
      FOREIGN KEY (doctor_profile_id)
      REFERENCES public.doctors(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'telemedicine_sessions_patient_profile_fk'
  ) THEN
    ALTER TABLE public.telemedicine_sessions
      ADD CONSTRAINT telemedicine_sessions_patient_profile_fk
      FOREIGN KEY (patient_profile_id)
      REFERENCES public.patients(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_telemedicine_sessions_doctor_profile
  ON public.telemedicine_sessions(doctor_profile_id);

CREATE INDEX IF NOT EXISTS idx_telemedicine_sessions_patient_profile
  ON public.telemedicine_sessions(patient_profile_id);

-- Canonical projection for application code that needs consistent profile ids.
CREATE OR REPLACE VIEW public.telemedicine_sessions_canonical AS
SELECT
  ts.*,
  COALESCE(ts.doctor_profile_id, d_by_id.id, d_by_user.id) AS canonical_doctor_id,
  COALESCE(ts.patient_profile_id, p_by_id.id, p_by_user.id) AS canonical_patient_id
FROM public.telemedicine_sessions ts
LEFT JOIN public.doctors d_by_id ON d_by_id.id = ts.doctor_id
LEFT JOIN public.doctors d_by_user ON d_by_user.user_id = ts.doctor_id
LEFT JOIN public.patients p_by_id ON p_by_id.id = ts.patient_id
LEFT JOIN public.patients p_by_user ON p_by_user.user_id = ts.patient_id;
