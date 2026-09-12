-- Migration: Create Medical Certificates Core (Atestados Médicos)
-- Path: supabase/migrations/20260912011500_create_medical_certificates_core.sql

-- 1. Create Medical Certificates Table
CREATE TABLE IF NOT EXISTS public.medical_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  appointment_id UUID REFERENCES public.appointments(id),
  cuir TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'signed' CHECK (status IN ('draft', 'signed', 'cancelled', 'expired')),
  certificate_type TEXT NOT NULL CHECK (certificate_type IN ('reposo_laboral', 'reposo_escolar', 'aptitud_fisica', 'constancia_atencion', 'tratamiento', 'otro')),
  days_of_rest INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  diagnosis TEXT,
  hide_diagnosis BOOLEAN NOT NULL DEFAULT false,
  observations TEXT,
  qr_code_content TEXT,
  signed_pdf_url TEXT,
  country_code TEXT NOT NULL DEFAULT 'AR'
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_medical_certificates_doctor_id ON public.medical_certificates(doctor_id);
CREATE INDEX IF NOT EXISTS idx_medical_certificates_patient_id ON public.medical_certificates(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_certificates_cuir ON public.medical_certificates(cuir);
CREATE INDEX IF NOT EXISTS idx_medical_certificates_created_at ON public.medical_certificates(created_at DESC);

-- 3. Row-Level Security (RLS)
ALTER TABLE public.medical_certificates ENABLE ROW LEVEL SECURITY;

-- 4. Granular RLS Policies
DROP POLICY IF EXISTS "Doctors can view their own certificates" ON public.medical_certificates;
CREATE POLICY "Doctors can view their own certificates"
  ON public.medical_certificates FOR SELECT
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Patients can view their own certificates" ON public.medical_certificates;
CREATE POLICY "Patients can view their own certificates"
  ON public.medical_certificates FOR SELECT
  USING (patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Doctors can insert their own certificates" ON public.medical_certificates;
CREATE POLICY "Doctors can insert their own certificates"
  ON public.medical_certificates FOR INSERT
  WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Doctors can update their draft certificates" ON public.medical_certificates;
CREATE POLICY "Doctors can update their draft certificates"
  ON public.medical_certificates FOR UPDATE
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()))
  WITH CHECK (status = 'draft');
