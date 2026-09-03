-- ============================================================================
-- Migration: 20260902210000_harden_clinic_metrics_and_rls.sql
-- Propósito:
--   1. Asegurar aislamiento multi-tenant en clinic_financial_metrics agregando
--      WITH (security_invoker = true) para que herede las políticas RLS del usuario.
--   2. Añadir políticas RLS completas (INSERT, UPDATE) en public.clinics.
--   3. Añadir lgpd_consent_version a public.patients para trazabilidad regulatoria ANPD.
-- ============================================================================

-- 1. Recrear la vista con security_invoker = true
CREATE OR REPLACE VIEW public.clinic_financial_metrics
WITH (security_invoker = true) AS
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

-- 2. Políticas RLS para clinics (INSERT / UPDATE)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'clinics' AND policyname = 'Clinic owners can update own clinic'
  ) THEN
    CREATE POLICY "Clinic owners can update own clinic"
      ON public.clinics FOR UPDATE
      TO authenticated
      USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'clinics' AND policyname = 'Authenticated users can create clinic'
  ) THEN
    CREATE POLICY "Authenticated users can create clinic"
      ON public.clinics FOR INSERT
      TO authenticated
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

-- 3. Trazabilidad de versión LGPD
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS lgpd_consent_version TEXT NOT NULL DEFAULT '1.0';
