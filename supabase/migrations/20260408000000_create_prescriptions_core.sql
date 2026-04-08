-- 1. Tablas de Prescripciones
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  appointment_id UUID REFERENCES public.appointments(id),
  cuir TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'sent', 'dispensed_partial', 'dispensed_total', 'cancelled', 'expired')),
  clinical_data JSONB NOT NULL,
  vendor_name TEXT NOT NULL,
  vendor_id TEXT,
  qr_code_content TEXT,
  signed_pdf_url TEXT,
  organization_id UUID REFERENCES public.organizations(id)
);

-- 2. Audit Log Inmutable
CREATE TABLE IF NOT EXISTS public.prescription_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id), 
  event_type TEXT NOT NULL, 
  user_id UUID NOT NULL REFERENCES auth.users(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  signature_hash TEXT
);

-- 3. Garantizar Inmutabilidad del Log
CREATE OR REPLACE FUNCTION public.prevent_modification_on_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is immutable. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE PLPGSQL;

DROP TRIGGER IF EXISTS tr_immutable_prescription_audit ON public.prescription_audit_events;
CREATE TRIGGER tr_immutable_prescription_audit 
BEFORE UPDATE OR DELETE ON public.prescription_audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_modification_on_audit_log();

-- 4. RLS Granular
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can insert their own prescriptions" ON public.prescriptions;
CREATE POLICY "Doctors can insert their own prescriptions" 
  ON public.prescriptions FOR INSERT 
  WITH CHECK (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Doctors can view their own prescriptions" ON public.prescriptions;
CREATE POLICY "Doctors can view their own prescriptions" 
  ON public.prescriptions FOR SELECT 
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Doctors can update their own draft prescriptions" ON public.prescriptions;
CREATE POLICY "Doctors can update their own draft prescriptions" 
  ON public.prescriptions FOR UPDATE 
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()))
  WITH CHECK (status = 'draft' OR status = 'signed');

DROP POLICY IF EXISTS "Patients can view their own prescriptions" ON public.prescriptions;
CREATE POLICY "Patients can view their own prescriptions" 
  ON public.prescriptions FOR SELECT 
  USING (patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view audit events of their own prescriptions" ON public.prescription_audit_events;
CREATE POLICY "Users can view audit events of their own prescriptions"
  ON public.prescription_audit_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p 
      WHERE p.id = prescription_id 
      AND (
        p.doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()) OR 
        p.patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id ON public.prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_cuir ON public.prescriptions(cuir);
