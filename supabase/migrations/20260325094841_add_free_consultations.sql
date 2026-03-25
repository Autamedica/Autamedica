-- Add free consultation credits to patients
-- New patients start with 3 free consultations.
-- Consumed when an appointment transitions to 'completed'.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS free_consultations_remaining integer NOT NULL DEFAULT 3;

COMMENT ON COLUMN patients.free_consultations_remaining IS
  'Number of free consultation credits remaining. Decremented on appointment completion.';

-- Backfill existing patients: give 3 minus their completed appointments count
UPDATE patients p
SET free_consultations_remaining = GREATEST(0, 3 - (
  SELECT COUNT(*)
  FROM appointments a
  WHERE a.patient_id = p.id
    AND a.status = 'completed'
));
