-- Patient-facing diagnostic study lifecycle, linked to the issuing clinician and optional medical order.
CREATE TABLE IF NOT EXISTS public.diagnostic_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  medical_order_id UUID REFERENCES public.medical_orders(id) ON DELETE SET NULL,
  study_type TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'pending', 'performed', 'available', 'cancelled')),
  diagnosis TEXT,
  notes TEXT,
  result_summary TEXT,
  result_storage_path TEXT,
  cuir TEXT UNIQUE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_studies_patient_created
  ON public.diagnostic_studies(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_studies_doctor_created
  ON public.diagnostic_studies(doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_studies_order
  ON public.diagnostic_studies(medical_order_id);

ALTER TABLE public.diagnostic_studies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can view their own diagnostic studies" ON public.diagnostic_studies;
CREATE POLICY "Patients can view their own diagnostic studies"
  ON public.diagnostic_studies FOR SELECT
  USING (patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Doctors can view their diagnostic studies" ON public.diagnostic_studies;
CREATE POLICY "Doctors can view their diagnostic studies"
  ON public.diagnostic_studies FOR SELECT
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Doctors can create their diagnostic studies" ON public.diagnostic_studies;
CREATE POLICY "Doctors can create their diagnostic studies"
  ON public.diagnostic_studies FOR INSERT
  WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Doctors can update their diagnostic studies" ON public.diagnostic_studies;
CREATE POLICY "Doctors can update their diagnostic studies"
  ON public.diagnostic_studies FOR UPDATE
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()))
  WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));
