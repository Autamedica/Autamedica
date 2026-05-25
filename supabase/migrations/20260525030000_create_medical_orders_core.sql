-- Migration: Create Medical Orders Core
-- Path: supabase/migrations/20260525030000_create_medical_orders_core.sql

-- 1. Create Main Medical Orders Table
CREATE TABLE IF NOT EXISTS public.medical_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  appointment_id UUID REFERENCES public.appointments(id),
  cuir TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'cancelled', 'expired')),
  study_type TEXT NOT NULL CHECK (study_type IN ('laboratory', 'imaging', 'cardiology', 'other')),
  practices JSONB NOT NULL, -- List of requested practices (e.g. [{"name": "Hemograma completo"}, {"name": "Hepatograma"}])
  diagnosis TEXT, -- Presumptive clinical diagnosis (CIE-10 or clinical text)
  notes TEXT, -- Patient preparation or clinical instructions
  qr_code_content TEXT,
  signed_pdf_url TEXT,
  organization_id UUID REFERENCES public.organizations(id)
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_medical_orders_doctor_id ON public.medical_orders(doctor_id);
CREATE INDEX IF NOT EXISTS idx_medical_orders_patient_id ON public.medical_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_orders_cuir ON public.medical_orders(cuir);

-- 3. Row-Level Security (RLS)
ALTER TABLE public.medical_orders ENABLE ROW LEVEL SECURITY;

-- 4. Granular RLS Policies

-- Select Policies
DROP POLICY IF EXISTS "Doctors can view their own medical orders" ON public.medical_orders;
CREATE POLICY "Doctors can view their own medical orders" 
  ON public.medical_orders FOR SELECT 
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Patients can view their own medical orders" ON public.medical_orders;
CREATE POLICY "Patients can view their own medical orders" 
  ON public.medical_orders FOR SELECT 
  USING (patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid()));

-- Insert Policies
DROP POLICY IF EXISTS "Doctors can insert their own medical orders" ON public.medical_orders;
CREATE POLICY "Doctors can insert their own medical orders" 
  ON public.medical_orders FOR INSERT 
  WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

-- Update Policies
DROP POLICY IF EXISTS "Doctors can update their own draft medical orders" ON public.medical_orders;
CREATE POLICY "Doctors can update their own draft medical orders" 
  ON public.medical_orders FOR UPDATE 
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()))
  WITH CHECK (status = 'draft');
