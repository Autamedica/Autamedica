-- Migration: 20260902230000_create_appointment_followups.sql
-- Goal: Table and indexes for post-consultation 48-hour clinical follow-up tracking (Eduardo Line 4)
-- Security: Strict RLS (patients see own, doctors see treated patients, admins see all, service_role all)

CREATE TABLE IF NOT EXISTS public.appointment_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  recipient_phone text NOT NULL,
  patient_name text,
  doctor_name text,
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email', 'sms', 'push')),
  event_type text NOT NULL DEFAULT 'appointment.followup_48h',
  message text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  last_error text,
  retry_count integer NOT NULL DEFAULT 0,
  dedupe_key text NOT NULL UNIQUE,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_followups IS 'Cola y registro de seguimiento clínico post-consulta (ej: 48h tras videoconsulta)';

-- RLS Configuration
ALTER TABLE public.appointment_followups ENABLE ROW LEVEL SECURITY;

-- 1. Service Role con acceso total de backend
DROP POLICY IF EXISTS "service_role_all_appointment_followups" ON public.appointment_followups;
CREATE POLICY "service_role_all_appointment_followups" ON public.appointment_followups
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Paciente: solo puede ver sus propios seguimientos
DROP POLICY IF EXISTS "patients_select_own_followups" ON public.appointment_followups;
DROP POLICY IF EXISTS "authenticated_select_appointment_followups" ON public.appointment_followups;
CREATE POLICY "patients_select_own_followups" ON public.appointment_followups
  FOR SELECT TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p WHERE p.user_id = auth.uid()
    )
  );

-- 3. Médico: solo puede ver seguimientos de pacientes que atendió
DROP POLICY IF EXISTS "doctors_select_own_followups" ON public.appointment_followups;
CREATE POLICY "doctors_select_own_followups" ON public.appointment_followups
  FOR SELECT TO authenticated
  USING (
    doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  );

-- 4. Administradores del sistema
DROP POLICY IF EXISTS "admins_all_followups" ON public.appointment_followups;
CREATE POLICY "admins_all_followups" ON public.appointment_followups
  FOR SELECT TO authenticated
  USING (
    public.is_system_admin()
  );

-- Indexing
CREATE INDEX IF NOT EXISTS idx_appointment_followups_pending
  ON public.appointment_followups (scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_appointment_followups_appointment_id
  ON public.appointment_followups (appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_followups_call_created
  ON public.appointment_followups (call_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_followups_patient_id
  ON public.appointment_followups (patient_id);

CREATE INDEX IF NOT EXISTS idx_appointment_followups_doctor_id
  ON public.appointment_followups (doctor_id);
