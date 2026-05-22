-- Ingesta Visual de Laboratorios - Estructura de Datos
-- Author: Antigravity (AI)
-- Context: Pipeline para Ingesta Visual y Análisis Clínico de Laboratorios vía WhatsApp (OpenClaw)

-- ============================================================================
-- 1. TABLES
-- ============================================================================

CREATE TYPE public.lab_analysis_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE IF NOT EXISTS public.clinical_ai_lab_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  inbound_message_id uuid REFERENCES public.appointment_inbound_messages(id) ON DELETE SET NULL,
  
  -- Ubicación del archivo de imagen original en Supabase Storage
  storage_path text NOT NULL,
  media_type text NOT NULL, -- 'image/jpeg', 'image/png'
  
  -- Estado del pipeline
  status public.lab_analysis_status NOT NULL DEFAULT 'PENDING',
  
  -- Resultados estructurados por Gemini
  study_name text,          -- Ej: 'Hemograma y Perfil Lipídico'
  study_date date,          -- Extraído de la foto
  extracted_data_json jsonb NOT NULL DEFAULT '{}'::jsonb, -- Parámetros médicos detallados
  red_flags_detected jsonb NOT NULL DEFAULT '[]'::jsonb,  -- Valores críticos fuera de rango
  clinical_summary text,     -- Resumen simplificado para el paciente
  
  -- Trazabilidad y auditoría
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clinical_ai_lab_analyses_patient
  ON public.clinical_ai_lab_analyses(patient_profile_id);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_lab_analyses_status
  ON public.clinical_ai_lab_analyses(status);

-- ============================================================================
-- 3. TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_clinical_ai_lab_analyses_updated_at ON public.clinical_ai_lab_analyses;
CREATE TRIGGER trg_clinical_ai_lab_analyses_updated_at
  BEFORE UPDATE ON public.clinical_ai_lab_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

-- ============================================================================
-- 4. RLS
-- ============================================================================

ALTER TABLE public.clinical_ai_lab_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_ai_lab_analyses_doctors_select ON public.clinical_ai_lab_analyses;
CREATE POLICY clinical_ai_lab_analyses_doctors_select
  ON public.clinical_ai_lab_analyses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.appointments a
      WHERE a.patient_profile_id = clinical_ai_lab_analyses.patient_profile_id
        AND a.doctor_profile_id = public.current_doctor_profile_id()
    )
  );

DROP POLICY IF EXISTS clinical_ai_lab_analyses_admins_select ON public.clinical_ai_lab_analyses;
CREATE POLICY clinical_ai_lab_analyses_admins_select
  ON public.clinical_ai_lab_analyses
  FOR SELECT
  TO authenticated
  USING (public.is_system_admin());

-- ============================================================================
-- 5. GRANTS
-- ============================================================================

GRANT SELECT ON TABLE public.clinical_ai_lab_analyses TO authenticated;
GRANT ALL ON TABLE public.clinical_ai_lab_analyses TO service_role;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.clinical_ai_lab_analyses IS 'Logical container for visual and clinical analysis of laboratory studies processed by Gemini Vision';
