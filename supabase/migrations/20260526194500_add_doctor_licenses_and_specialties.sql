-- Migration: Add doctor_licenses and doctor_specialties tables for multi-jurisdictional enrollment and structured specialties.
-- Date: 2026-05-26 19:45:00
-- Author: AutaMedica Agent

-- 1. Create doctor_licenses table
CREATE TABLE IF NOT EXISTS public.doctor_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    license_number TEXT NOT NULL,
    license_type TEXT NOT NULL CHECK (license_type IN ('MN', 'MP')),
    province TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
    issued_by TEXT,
    issued_at DATE,
    sisa_book TEXT,
    sisa_folio TEXT,
    sisa_record TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_doctor_province_license UNIQUE (doctor_id, province, license_number)
);

-- 2. Create doctor_specialties table
CREATE TABLE IF NOT EXISTS public.doctor_specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
    specialty_name TEXT NOT NULL,
    certification_entity TEXT,
    certified_at DATE,
    expires_at DATE,
    sisa_specialty_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_doctor_specialty UNIQUE (doctor_id, specialty_name)
);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_doctor_licenses_doctor_id ON public.doctor_licenses(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_licenses_number ON public.doctor_licenses(license_number);
CREATE INDEX IF NOT EXISTS idx_doctor_specialties_doctor_id ON public.doctor_specialties(doctor_id);

-- 3. Configure Row Level Security (RLS)
ALTER TABLE public.doctor_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_specialties ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for doctor_licenses
CREATE POLICY "Users can view own licenses" 
    ON public.doctor_licenses 
    FOR SELECT 
    USING (auth.uid() IN (SELECT user_id FROM public.doctors WHERE id = doctor_id));

CREATE POLICY "Authenticated users can read active licenses for validation"
    ON public.doctor_licenses
    FOR SELECT
    TO authenticated
    USING (status = 'active');

CREATE POLICY "Admins have full access on licenses"
    ON public.doctor_licenses
    FOR ALL
    TO service_role
    USING (true);

-- Create RLS Policies for doctor_specialties
CREATE POLICY "Users can view own specialties"
    ON public.doctor_specialties
    FOR SELECT
    USING (auth.uid() IN (SELECT user_id FROM public.doctors WHERE id = doctor_id));

CREATE POLICY "Authenticated users can read specialties for validation"
    ON public.doctor_specialties
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Admins have full access on specialties"
    ON public.doctor_specialties
    FOR ALL
    TO service_role
    USING (true);

-- 4. Backfill existing single-row records to new relational tables
-- Migrar matrículas actuales (MN/MP)
INSERT INTO public.doctor_licenses (doctor_id, license_number, license_type, province, status, issued_by)
SELECT 
    id, 
    license_number, 
    CASE WHEN enrollment_jurisdiction = 'CABA' THEN 'MN' ELSE 'MP' END, 
    COALESCE(enrollment_jurisdiction, 'CABA'), 
    CASE WHEN active = true THEN 'active' ELSE 'inactive' END,
    enrollment_entity
FROM public.doctors
WHERE license_number IS NOT NULL AND license_number <> ''
ON CONFLICT (doctor_id, province, license_number) DO NOTHING;

-- Migrar especialidades actuales
INSERT INTO public.doctor_specialties (doctor_id, specialty_name)
SELECT id, specialty
FROM public.doctors
WHERE specialty IS NOT NULL AND specialty <> ''
ON CONFLICT (doctor_id, specialty_name) DO NOTHING;

INSERT INTO public.doctor_specialties (doctor_id, specialty_name)
SELECT id, subspecialty
FROM public.doctors
WHERE subspecialty IS NOT NULL AND subspecialty <> ''
ON CONFLICT (doctor_id, specialty_name) DO NOTHING;

-- 5. Set triggers for automated updated_at column
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_licenses
    BEFORE UPDATE ON public.doctor_licenses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_specialties
    BEFORE UPDATE ON public.doctor_specialties
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
