-- Migration: Regulatory Compliance Argentina (Ley 27.553 & Res. 2214/2025)
-- Purpose: Add mandatory fields for prescriptions and healthcare professionals in Argentina.

-- 1. Updates to Doctors Table
ALTER TABLE public.doctors 
ADD COLUMN IF NOT EXISTS refeps_id TEXT,
ADD COLUMN IF NOT EXISTS enrollment_entity TEXT,
ADD COLUMN IF NOT EXISTS enrollment_jurisdiction TEXT,
ADD COLUMN IF NOT EXISTS professional_address TEXT;

COMMENT ON COLUMN public.doctors.refeps_id IS 'Registro Federal de Profesionales de la Salud (Obligatorio Res. 2214/2025)';
COMMENT ON COLUMN public.doctors.enrollment_jurisdiction IS 'Jurisdicción de matrícula (ej: MN, MP Buenos Aires, etc.)';

-- 2. Updates to Patients Table
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS cuil TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN public.patients.cuil IS 'Código Único de Identificación Laboral (Requerido para trazabilidad RCTA)';

-- 3. Updates to Health Centers (Pharmacies) Table
ALTER TABLE public.health_centers
ADD COLUMN IF NOT EXISTS registration_number TEXT;

COMMENT ON COLUMN public.health_centers.registration_number IS 'Número de habilitación ANMAT o provincial para farmacias';

-- 4. Updates to Prescriptions Table
ALTER TABLE public.prescriptions
ADD COLUMN IF NOT EXISTS is_controlled_substance BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS controlled_substance_list TEXT,
ADD COLUMN IF NOT EXISTS rcta_registration_id TEXT;

COMMENT ON COLUMN public.prescriptions.rcta_registration_id IS 'ID de registro en el RCTA nacional (CUIR oficial)';

-- 5. Logic for CUIR format validation (Example: RCTA format)
-- This is just metadata to ensure we follow the standard.
