-- ============================================================================
-- Migration: 20260903134300_add_uf_brazil_to_doctor_licenses.sql
-- Propósito:
--   Agregar columna uf_brazil a doctor_licenses para soportar el sistema
--   multi-país (Brasil) de licencias médicas (CRM por UF).
--   El adapter doctors.adapter.ts ya referencia esta columna en el select,
--   causando error 42703 en producción.
-- ============================================================================

ALTER TABLE public.doctor_licenses
  ADD COLUMN IF NOT EXISTS uf_brazil TEXT;

COMMENT ON COLUMN public.doctor_licenses.uf_brazil IS 'Unidade Federativa (estado) de Brasil para licencias CRM, e.g. SP, RJ, RS';
