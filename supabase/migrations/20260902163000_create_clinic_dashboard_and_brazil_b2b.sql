-- Migration: Add Brazil Clinic B2B Dashboard and Tenants
-- Date: 2026-09-02
-- Author: AutaMedica Agent

-- 1. Clinics table (Tenants)
CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS para Clinics
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owners can view their own clinics" 
  ON public.clinics FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- 2. Associate Doctors with Clinics
ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id);

CREATE INDEX IF NOT EXISTS idx_doctors_clinic_id ON public.doctors(clinic_id);

-- 3. Pre-consultations to Paid Appointments Metrics (Admin Dashboard View)
CREATE OR REPLACE VIEW public.clinic_financial_metrics AS
SELECT 
  d.clinic_id,
  c.name AS clinic_name,
  COUNT(a.id) AS total_appointments,
  COUNT(CASE WHEN a.status = 'completed' THEN 1 END) AS completed_appointments,
  COUNT(CASE WHEN p.status = 'approved' THEN 1 END) AS paid_appointments,
  SUM(CASE WHEN p.status = 'approved' THEN p.amount_cents ELSE 0 END) / 100.0 AS total_revenue,
  -- AutaMedica fee 5%
  SUM(CASE WHEN p.status = 'approved' THEN (p.amount_cents * 0.05) ELSE 0 END) / 100.0 AS autamedica_fee,
  -- Clinic/Doctor gets 95%
  SUM(CASE WHEN p.status = 'approved' THEN (p.amount_cents * 0.95) ELSE 0 END) / 100.0 AS clinic_revenue
FROM public.appointments a
JOIN public.doctors d ON a.doctor_id = d.id
JOIN public.clinics c ON c.id = d.clinic_id
LEFT JOIN public.appointment_payments p ON p.appointment_id = a.id
GROUP BY d.clinic_id, c.name;

-- 4. LGPD Consent check
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS lgpd_consent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_consent_date TIMESTAMPTZ;

-- 5. Data Privacy Officer (DPO) Contact info in Clinic
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS dpo_name TEXT,
  ADD COLUMN IF NOT EXISTS dpo_email TEXT;
