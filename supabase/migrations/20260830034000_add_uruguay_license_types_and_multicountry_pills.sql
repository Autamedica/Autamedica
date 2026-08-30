-- Migration: Add Uruguay License Types and Multi-Country License Constraints
-- Date: 2026-08-30 03:40:00
-- Author: AutaMedica Agent

-- 1. Ampliar tipos de matrícula en doctor_licenses para incluir MSP, CMU y CJPPU de Uruguay
ALTER TABLE public.doctor_licenses 
  DROP CONSTRAINT IF EXISTS doctor_licenses_license_type_check;

ALTER TABLE public.doctor_licenses 
  ADD CONSTRAINT doctor_licenses_license_type_check 
  CHECK (license_type IN ('MN', 'MP', 'CRM', 'CRO', 'CRF', 'RMS', 'MSP', 'CMU', 'CJPPU'));

-- 2. Asegurar que prescriptions tenga country_code con default 'AR'
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'AR' 
  CHECK (country_code IN ('AR', 'BR', 'UY', 'CL', 'MX'));
