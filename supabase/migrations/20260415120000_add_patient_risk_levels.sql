-- 🚦 SEMÁFORO DE RIESGO: PRIORIZACIÓN PARA MÉDICOS (AUTAMEDICA)
-- Habilita que el médico "salga a buscar" al paciente basándose en el riesgo.

ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'green',
ADD COLUMN IF NOT EXISTS risk_reason text;

-- Restricción para asegurar que solo haya valores válidos
ALTER TABLE public.patients 
ADD CONSTRAINT chk_patients_risk_level CHECK (risk_level IN ('red', 'yellow', 'green'));

-- Comentario para auditoría clínica
COMMENT ON COLUMN public.patients.risk_level IS 'Nivel de riesgo clínico/administrativo (Semáforo).';
COMMENT ON COLUMN public.patients.risk_reason IS 'Motivo por el cual se asignó el nivel de riesgo (vía IA o Manual).';
