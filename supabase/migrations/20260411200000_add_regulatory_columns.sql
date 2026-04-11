-- Add regulatory columns required by Res. 2214/2025 and Ley 27.553
-- for valid electronic prescriptions.

-- Doctor regulatory metadata
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS refeps_id text;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS enrollment_entity text;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS enrollment_jurisdiction text;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS professional_address text;

-- Patient regulatory metadata
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS cuil text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS address text;

-- Audit: signature hash for digital signature evidence
ALTER TABLE public.prescription_audit_events ADD COLUMN IF NOT EXISTS signature_hash text;
