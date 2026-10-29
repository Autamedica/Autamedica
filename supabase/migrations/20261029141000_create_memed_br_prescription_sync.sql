-- AutaMedica BR / Memed. Never equate provider metadata with a valid signed PDF.
-- Application uses service-role operations only; patients and clinicians must
-- obtain authorized delivery artifacts through dedicated application routes.
CREATE TABLE IF NOT EXISTS public.memed_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  memed_id text NOT NULL UNIQUE CHECK (length(memed_id) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'verified_at_provider'
    CHECK (status IN ('verified_at_provider', 'deleted')),
  provider_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  digital_link_data jsonb,
  pdf_signature_verified boolean NOT NULL DEFAULT false,
  patient_delivery_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memed_prescriptions_patient
  ON public.memed_prescriptions (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memed_prescriptions_doctor
  ON public.memed_prescriptions (doctor_id, created_at DESC);

ALTER TABLE public.memed_prescriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.memed_prescriptions FROM anon, authenticated;
COMMENT ON TABLE public.memed_prescriptions IS
  'Verified Memed issuance and deletion events only. Does not attest to digital signature, SNCR status or patient delivery.';
