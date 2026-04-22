-- Guest appointments are tied to an appointment and invite token, not to a
-- public.patients row. Doctor-started calls for those appointments must be
-- able to create a calls row with patient_id = null.
ALTER TABLE public.calls ALTER COLUMN patient_id DROP NOT NULL;

COMMENT ON COLUMN public.calls.patient_id IS
  'Nullable because external guest calls do not have an internal patient record.';
