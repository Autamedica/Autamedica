-- =====================================================================
-- Migration: 20260918172500_create_pharmacy_on_demand_consultations.sql
-- Description: Core schema for Fast-Track Pharmacy On-Demand Consultation & Prescriptions
-- Tables:
--   1. ALTER TABLE public.doctors (on_duty_pharmacy, on_duty_since)
--   2. public.doctor_on_duty_sessions
--   3. public.pharmacy_consultation_requests
-- =====================================================================

-- 1. Doctor On-Duty Pharmacy Fields
ALTER TABLE public.doctors 
  ADD COLUMN IF NOT EXISTS on_duty_pharmacy BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.doctors 
  ADD COLUMN IF NOT EXISTS on_duty_since TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_doctors_on_duty_pharmacy 
  ON public.doctors(on_duty_pharmacy) 
  WHERE on_duty_pharmacy = true;

COMMENT ON COLUMN public.doctors.on_duty_pharmacy IS 
  'Flag indicating whether the doctor is currently available on-duty for fast-track pharmacy requests';

-- 2. Doctor On-Duty Sessions (audit and telemetry of on-duty windows)
CREATE TABLE IF NOT EXISTS public.doctor_on_duty_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_doctor_on_duty_sessions_doctor 
  ON public.doctor_on_duty_sessions(doctor_id, status);

COMMENT ON TABLE public.doctor_on_duty_sessions IS 
  'Session log for doctors on duty for on-demand pharmacy triage and urgent digital prescriptions';

-- 3. Pharmacy Consultation Requests Queue
CREATE TABLE IF NOT EXISTS public.pharmacy_consultation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE SET NULL,
  pharmacy_name TEXT NOT NULL,
  patient_dni TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'assigned', 'in_call', 'completed', 'cancelled', 'expired')),
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  call_id UUID REFERENCES public.calls(id) ON DELETE SET NULL,
  room_id TEXT,
  guest_invite_id UUID REFERENCES public.call_guest_invites(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_requests_status_created 
  ON public.pharmacy_consultation_requests(status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_pharmacy_requests_pharmacy_id 
  ON public.pharmacy_consultation_requests(pharmacy_id);

CREATE INDEX IF NOT EXISTS idx_pharmacy_requests_doctor_id 
  ON public.pharmacy_consultation_requests(doctor_id);

COMMENT ON TABLE public.pharmacy_consultation_requests IS 
  'Queue of on-demand patient consultation requests originating from pharmacy kiosks or QR counter scans';

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.doctor_on_duty_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_consultation_requests ENABLE ROW LEVEL SECURITY;

-- 4.1 Policies for doctor_on_duty_sessions
DROP POLICY IF EXISTS "doctors_manage_own_duty_sessions" ON public.doctor_on_duty_sessions;
CREATE POLICY "doctors_manage_own_duty_sessions"
  ON public.doctor_on_duty_sessions
  FOR ALL
  TO authenticated
  USING (
    doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid())
  )
  WITH CHECK (
    doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "service_role_all_duty_sessions" ON public.doctor_on_duty_sessions;
CREATE POLICY "service_role_all_duty_sessions"
  ON public.doctor_on_duty_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4.2 Policies for pharmacy_consultation_requests
-- Kiosk / QR insertion: anon or authenticated patients can create requests
DROP POLICY IF EXISTS "allow_insert_pharmacy_requests" ON public.pharmacy_consultation_requests;
CREATE POLICY "allow_insert_pharmacy_requests"
  ON public.pharmacy_consultation_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Patient waiting room: read request by ID
DROP POLICY IF EXISTS "allow_select_own_pharmacy_request" ON public.pharmacy_consultation_requests;
CREATE POLICY "allow_select_own_pharmacy_request"
  ON public.pharmacy_consultation_requests
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Doctors: update request when claiming or completing
DROP POLICY IF EXISTS "doctors_update_pharmacy_requests" ON public.pharmacy_consultation_requests;
CREATE POLICY "doctors_update_pharmacy_requests"
  ON public.pharmacy_consultation_requests
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending' 
    OR doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid())
  )
  WITH CHECK (
    doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid())
    OR status IN ('cancelled', 'completed', 'assigned', 'in_call')
  );

DROP POLICY IF EXISTS "service_role_all_pharmacy_requests" ON public.pharmacy_consultation_requests;
CREATE POLICY "service_role_all_pharmacy_requests"
  ON public.pharmacy_consultation_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'pharmacy_consultation_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_consultation_requests;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;
