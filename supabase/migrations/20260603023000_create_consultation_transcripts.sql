-- Create consultation transcripts table to store transcription text and segments
CREATE TABLE IF NOT EXISTS public.consultation_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  full_text TEXT NOT NULL,
  duration_seconds INTEGER,
  word_count INTEGER NOT NULL DEFAULT 0,
  consent_doctor BOOLEAN NOT NULL DEFAULT false,
  consent_patient BOOLEAN NOT NULL DEFAULT false,
  lang TEXT NOT NULL DEFAULT 'es-AR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance queries
CREATE INDEX IF NOT EXISTS idx_consultation_transcripts_room_id 
  ON public.consultation_transcripts(room_id);

CREATE INDEX IF NOT EXISTS idx_consultation_transcripts_doctor_id 
  ON public.consultation_transcripts(doctor_id);

CREATE INDEX IF NOT EXISTS idx_consultation_transcripts_patient_id 
  ON public.consultation_transcripts(patient_id);

CREATE INDEX IF NOT EXISTS idx_consultation_transcripts_appointment_id 
  ON public.consultation_transcripts(appointment_id);

-- Enable RLS
ALTER TABLE public.consultation_transcripts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Doctors can read own consultation transcripts" ON public.consultation_transcripts;
CREATE POLICY "Doctors can read own consultation transcripts"
  ON public.consultation_transcripts
  FOR SELECT
  TO authenticated
  USING (
    doctor_id = (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Patients can read own consultation transcripts" ON public.consultation_transcripts;
CREATE POLICY "Patients can read own consultation transcripts"
  ON public.consultation_transcripts
  FOR SELECT
  TO authenticated
  USING (
    patient_id = (SELECT id FROM public.patients WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Doctors can insert own consultation transcripts" ON public.consultation_transcripts;
CREATE POLICY "Doctors can insert own consultation transcripts"
  ON public.consultation_transcripts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    doctor_id = (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.consultation_transcripts TO authenticated;
GRANT ALL ON public.consultation_transcripts TO service_role;
