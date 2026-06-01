-- Migración: Crear tabla de preconsultas de citas (appointment_preconsultations)
-- Timestamp: 20260528043000_create_appointment_preconsultations.sql

CREATE TABLE IF NOT EXISTS public.appointment_preconsultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
    clinical_state JSONB NOT NULL DEFAULT '{}'::jsonb, -- ClinicalCaseState acumulativo
    extraction_summary JSONB DEFAULT '{}'::jsonb, -- Resultado final estructurado por Álvarez (ALICIADO + Red Flags)
    audio_log_urls TEXT[] DEFAULT '{}'::text[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.appointment_preconsultations ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad RLS
DROP POLICY IF EXISTS "Users can view and edit own preconsultations"
    ON public.appointment_preconsultations;

CREATE POLICY "Users can view and edit own preconsultations"
    ON public.appointment_preconsultations
    FOR ALL
    USING (auth.uid() = patient_id)
    WITH CHECK (auth.uid() = patient_id);

-- Registrar comentarios explicativos
COMMENT ON TABLE public.appointment_preconsultations IS 'Almacena el estado del diálogo semiológico conversacional por pasos de voz para preconsulta del paciente (motor de Álvarez).';
