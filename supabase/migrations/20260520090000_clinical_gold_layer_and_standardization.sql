-- Migration: Clinical Gold Layer, HL7 FHIR Concept Standardization & Early Warning Engine
-- Timestamp: 20260520090000

-- ====================================================================
-- 0. SCHEMA ADAPTATIONS (Ensure HL7 FHIR columns exist)
-- ====================================================================

ALTER TABLE public.clinical_symptom_observations 
  ADD COLUMN IF NOT EXISTS icd11_code VARCHAR(50);

ALTER TABLE public.clinical_patient_conditions 
  ADD COLUMN IF NOT EXISTS snomed_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS icd11_code VARCHAR(50);

-- ====================================================================
-- 1. PILAR 1: HL7 FHIR CONCEPT STANDARDIZATION (clinical_concept_maps)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.clinical_concept_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_code VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'headache', 'hypertension'
  display_name_es VARCHAR(150) NOT NULL,    -- e.g., 'Cefalea / Dolor de cabeza'
  snomed_code VARCHAR(50),                  -- SNOMED-CT Code
  snomed_display VARCHAR(200),              -- SNOMED-CT Preferred Term
  icd11_code VARCHAR(50),                   -- ICD-11 / CIE-11 Code
  icd11_display VARCHAR(200),               -- ICD-11 Preferred Term
  loinc_code VARCHAR(50),                   -- LOINC Code (for vital constants)
  concept_type VARCHAR(50) NOT NULL,        -- 'symptom', 'condition', 'vital'
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS for clinical_concept_maps
ALTER TABLE public.clinical_concept_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for concept maps"
  ON public.clinical_concept_maps FOR SELECT
  USING (true);

-- Populate Concept Maps (Symptoms & Conditions mapped to International Ontologies)
INSERT INTO public.clinical_concept_maps 
  (local_code, display_name_es, snomed_code, snomed_display, icd11_code, icd11_display, concept_type)
VALUES
  -- Symptoms
  ('headache', 'Cefalea / Dolor de cabeza', '25064002', 'Headache (finding)', '8A80.y', 'Other specified headache', 'symptom'),
  ('chest_pain', 'Dolor torácico / Pecho', '29857009', 'Chest pain (finding)', 'MB46', 'Chest pain', 'symptom'),
  ('cervical_pressure', 'Presión cervical', '398014009', 'Cervical spinal pressure (finding)', 'ME84.1', 'Spine pain', 'symptom'),
  ('dyspnea', 'Dificultad respiratoria (Disnea)', '267036007', 'Dyspnea (finding)', 'MD11', 'Dyspnea', 'symptom'),
  ('cough', 'Tos', '49727002', 'Cough (finding)', 'MD10', 'Cough', 'symptom'),
  ('abdominal_pain', 'Dolor abdominal', '21522001', 'Abdominal pain (finding)', 'ME05', 'Abdominal pain', 'symptom'),
  ('digestive_symptoms', 'Síntomas digestivos', '162057008', 'Digestive symptom (finding)', 'ME00', 'Symptoms of digestive system', 'symptom'),
  ('genitourinary_symptoms', 'Síntomas genitourinarios', '162125007', 'Genitourinary symptom (finding)', 'MF50', 'Symptoms of urinary system', 'symptom'),
  ('palpitations', 'Palpitaciones', '80313002', 'Palpitations (finding)', 'MB45.1', 'Palpitations', 'symptom'),
  ('fatigue', 'Fatiga / Cansancio extremo', '84229001', 'Fatigue (finding)', 'MG48', 'Fatigue', 'symptom'),
  ('fever', 'Fiebre / Síndrome febril', '386661006', 'Fever (finding)', 'MG26', 'Fever of unknown origin', 'symptom'),
  ('dizziness', 'Mareos / Inestabilidad', '17971005', 'Dizziness (finding)', 'MB42', 'Dizziness and giddiness', 'symptom'),
  ('back_pain', 'Dorsalgia / Dolor de espalda', '224975004', 'Backache (finding)', 'ME84.2', 'Back pain', 'symptom'),
  ('neuro', 'Déficit o foco neurológico', '128604000', 'Neurological deficit (finding)', 'MG43', 'Symptoms of nervous system', 'symptom'),
  ('mood_disorder', 'Trastorno del ánimo / Ansiedad', '38694004', 'Anxiety (finding)', '6A60', 'Anxiety or fear-related disorders', 'symptom'),
  
  -- Conditions (Antecedentes)
  ('hypertension', 'Hipertensión Arterial', '38341003', 'Hypertensive disorder, systemic arterial (disorder)', 'BA00', 'Essential hypertension', 'condition'),
  ('diabetes', 'Diabetes Mellitus', '73211009', 'Diabetes mellitus (disorder)', '5A10', 'Diabetes mellitus', 'condition'),
  ('asthma', 'Asma Bronquial', '195967001', 'Asthma (disorder)', 'CA23', 'Asthma', 'condition'),
  ('smoker', 'Tabaquismo', '77176002', 'Smoker (finding)', 'XM64T2', 'Tobacco use', 'condition')
ON CONFLICT (local_code) DO NOTHING;


-- ====================================================================
-- 2. REWRITE PL/PGSQL TRIGGER TO EMBED CODES IN REAL-TIME PIPELINE
-- ====================================================================

CREATE OR REPLACE FUNCTION public.process_anamnesis_extraction_silver_layer()
RETURNS TRIGGER AS $$
DECLARE
  chief_complaint VARCHAR(100);
  associated_symptom TEXT;
  red_flag VARCHAR(100);
  antecedent JSONB;
  clean_symptom_name VARCHAR(150);
  resolved_snomed VARCHAR(50);
  resolved_icd11 VARCHAR(50);
BEGIN
  -- Verify extraction result is available and checkpoint is 'final' to build mature intelligence
  IF NEW.extraction_result IS NULL OR NEW.extraction_result = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- Verify patient exists in the patients table to avoid FK violation on orphaned extractions
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = NEW.patient_id) THEN
    RETURN NEW;
  END IF;

  -- Clear previous observations for the updated raw extraction surgically
  DELETE FROM public.clinical_symptom_observations WHERE anamnesis_extraction_id = NEW.id;
  DELETE FROM public.clinical_patient_conditions WHERE anamnesis_extraction_id = NEW.id;

  -- 1. Main Symptom (Chief Complaint)
  chief_complaint := NEW.extraction_result->'normalizedOpenFields'->>'chiefComplaintCode';
  IF chief_complaint IS NOT NULL AND chief_complaint <> '' THEN
    -- Look up standard codes in our Concept Map
    SELECT display_name_es, snomed_code, icd11_code 
    INTO clean_symptom_name, resolved_snomed, resolved_icd11
    FROM public.clinical_concept_maps
    WHERE local_code = chief_complaint;

    IF clean_symptom_name IS NULL THEN
      clean_symptom_name := initcap(replace(chief_complaint, '_', ' '));
    END IF;

    INSERT INTO public.clinical_symptom_observations 
      (anamnesis_extraction_id, patient_id, symptom_name, is_primary, is_red_flag, snomed_code, icd11_code, created_at)
    VALUES 
      (NEW.id, NEW.patient_id, clean_symptom_name, true, false, resolved_snomed, resolved_icd11, NEW.created_at);
  END IF;

  -- 2. Associated Symptoms
  IF NEW.extraction_result->'presentIllness'->'associatedSymptoms' IS NOT NULL THEN
    FOR associated_symptom IN 
      SELECT jsonb_array_elements_text(NEW.extraction_result->'presentIllness'->'associatedSymptoms')
    LOOP
      IF associated_symptom IS NOT NULL AND trim(associated_symptom) <> '' THEN
        -- Standardize text formatting
        clean_symptom_name := initcap(trim(associated_symptom));
        
        -- Try to resolve standard terminology code
        SELECT snomed_code, icd11_code 
        INTO resolved_snomed, resolved_icd11
        FROM public.clinical_concept_maps
        WHERE lower(local_code) = lower(trim(associated_symptom)) 
           OR lower(display_name_es) = lower(trim(associated_symptom));

        -- Avoid inserting duplicate primary symptoms
        IF NOT EXISTS (
          SELECT 1 FROM public.clinical_symptom_observations 
          WHERE anamnesis_extraction_id = NEW.id 
            AND lower(symptom_name) = lower(clean_symptom_name)
        ) THEN
          INSERT INTO public.clinical_symptom_observations 
            (anamnesis_extraction_id, patient_id, symptom_name, is_primary, is_red_flag, snomed_code, icd11_code, created_at)
          VALUES 
            (NEW.id, NEW.patient_id, clean_symptom_name, false, false, resolved_snomed, resolved_icd11, NEW.created_at);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Red Flags
  IF NEW.extraction_result->'normalizedOpenFields'->'redFlagCodes' IS NOT NULL THEN
    FOR red_flag IN 
      SELECT jsonb_array_elements_text(NEW.extraction_result->'normalizedOpenFields'->'redFlagCodes')
    LOOP
      IF red_flag IS NOT NULL AND trim(red_flag) <> '' THEN
        -- Look up codes in our Concept Map
        SELECT display_name_es, snomed_code, icd11_code 
        INTO clean_symptom_name, resolved_snomed, resolved_icd11
        FROM public.clinical_concept_maps
        WHERE local_code = red_flag;

        IF clean_symptom_name IS NULL THEN
          clean_symptom_name := initcap(replace(red_flag, '_', ' '));
        END IF;

        INSERT INTO public.clinical_symptom_observations 
          (anamnesis_extraction_id, patient_id, symptom_name, is_primary, is_red_flag, snomed_code, icd11_code, created_at)
        VALUES 
          (NEW.id, NEW.patient_id, clean_symptom_name, false, true, resolved_snomed, resolved_icd11, NEW.created_at);
      END IF;
    END LOOP;
  END IF;

  -- 4. Conditions (Antecedentes)
  -- 4a. Pathological History (Antecedentes Patológicos)
  IF NEW.extraction_result->'medicalHistory'->'pathological' IS NOT NULL THEN
    FOR antecedent IN 
      SELECT jsonb_array_elements(NEW.extraction_result->'medicalHistory'->'pathological')
    LOOP
      IF antecedent->>'conditionCode' IS NOT NULL THEN
        -- Look up Standard Codes
        SELECT display_name_es, snomed_code, icd11_code 
        INTO clean_symptom_name, resolved_snomed, resolved_icd11
        FROM public.clinical_concept_maps
        WHERE local_code = antecedent->>'conditionCode';

        IF clean_symptom_name IS NULL THEN
          clean_symptom_name := initcap(replace(antecedent->>'conditionCode', '_', ' '));
        END IF;

        INSERT INTO public.clinical_patient_conditions 
          (anamnesis_extraction_id, patient_id, condition_name, category, snomed_code, icd11_code, created_at)
        VALUES 
          (NEW.id, NEW.patient_id, clean_symptom_name, 'pathological', resolved_snomed, resolved_icd11, NEW.created_at);
      END IF;
    END LOOP;
  END IF;

  -- 4b. Physiological History (Antecedentes Fisiológicos / Estilo de Vida)
  IF NEW.extraction_result->'medicalHistory'->'physiological' IS NOT NULL THEN
    FOR antecedent IN 
      SELECT jsonb_array_elements(NEW.extraction_result->'medicalHistory'->'physiological')
    LOOP
      IF antecedent->>'conditionCode' IS NOT NULL THEN
        SELECT display_name_es, snomed_code, icd11_code 
        INTO clean_symptom_name, resolved_snomed, resolved_icd11
        FROM public.clinical_concept_maps
        WHERE local_code = antecedent->>'conditionCode';

        IF clean_symptom_name IS NULL THEN
          clean_symptom_name := initcap(replace(antecedent->>'conditionCode', '_', ' '));
        END IF;

        INSERT INTO public.clinical_patient_conditions 
          (anamnesis_extraction_id, patient_id, condition_name, category, snomed_code, icd11_code, created_at)
        VALUES 
          (NEW.id, NEW.patient_id, clean_symptom_name, 'physiological', resolved_snomed, resolved_icd11, NEW.created_at);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ====================================================================
-- 3. PILAR 2: CAPA ORO (VISTAS MATERIALIZADAS / HIGH PERFORMANCE OLAP)
-- ====================================================================

-- Materialized View for seasonal statistics aggregations (refreshed hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.clinical_gold_seasonal_metrics AS
SELECT 
  season,
  symptom_name,
  snomed_code,
  icd11_code,
  COUNT(*) as case_count
FROM (
  SELECT 
    symptom_name,
    snomed_code,
    icd11_code,
    CASE 
      -- Summer: Dec 21 - Mar 20
      WHEN (EXTRACT(MONTH FROM created_at) = 12 AND EXTRACT(DAY FROM created_at) >= 21)
        OR EXTRACT(MONTH FROM created_at) IN (1, 2)
        OR (EXTRACT(MONTH FROM created_at) = 3 AND EXTRACT(DAY FROM created_at) <= 20) THEN 'Verano'
      -- Autumn: Mar 21 - Jun 20
      WHEN (EXTRACT(MONTH FROM created_at) = 3 AND EXTRACT(DAY FROM created_at) >= 21)
        OR EXTRACT(MONTH FROM created_at) IN (4, 5)
        OR (EXTRACT(MONTH FROM created_at) = 6 AND EXTRACT(DAY FROM created_at) <= 20) THEN 'Otoño'
      -- Winter: Jun 21 - Sep 20
      WHEN (EXTRACT(MONTH FROM created_at) = 6 AND EXTRACT(DAY FROM created_at) >= 21)
        OR EXTRACT(MONTH FROM created_at) IN (7, 8)
        OR (EXTRACT(MONTH FROM created_at) = 9 AND EXTRACT(DAY FROM created_at) <= 20) THEN 'Invierno'
      -- Spring: Sep 21 - Dec 20
      ELSE 'Primavera'
    END as season
  FROM public.clinical_symptom_observations
  WHERE is_red_flag = false
) as raw_seasons
GROUP BY season, symptom_name, snomed_code, icd11_code;

-- Create unique index on materialized view to allow CONCURRENT refreshes
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_seasonal_metrics_uniq 
  ON public.clinical_gold_seasonal_metrics (season, symptom_name);


-- ====================================================================
-- 4. PILAR 3: EARLY WARNING ENGINE (ANOMALY & OUTBREAK DETECTION)
-- ====================================================================

-- Function to dynamically compute and detect epidemiological anomalies in symptoms
DROP FUNCTION IF EXISTS public.detect_clinical_anomalies();

CREATE OR REPLACE FUNCTION public.detect_clinical_anomalies()
RETURNS TABLE (
  symptom TEXT,
  snomed TEXT,
  last_week_count BIGINT,
  historical_weekly_avg NUMERIC,
  percent_increase NUMERIC,
  is_outbreak_warning BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH weekly_stats AS (
    -- Count of cases for each symptom in the last 7 days
    SELECT 
      symptom_name,
      snomed_code,
      COUNT(*) as last_week
    FROM public.clinical_symptom_observations
    WHERE created_at >= now() - INTERVAL '7 days'
      AND is_red_flag = false
    GROUP BY symptom_name, snomed_code
  ),
  historical_stats AS (
    -- Average count of cases per week historically
    SELECT 
      symptom_name,
      snomed_code,
      COALESCE(COUNT(*) / GREATEST(EXTRACT(epoch FROM (now() - MIN(created_at))) / 604800, 1), 0)::NUMERIC as weekly_avg
    FROM public.clinical_symptom_observations
    WHERE created_at < now() - INTERVAL '7 days'
      AND is_red_flag = false
    GROUP BY symptom_name, snomed_code
  )
  SELECT 
    w.symptom_name as symptom,
    w.snomed_code as snomed,
    w.last_week as last_week_count,
    ROUND(h.weekly_avg, 2) as historical_weekly_avg,
    ROUND(((w.last_week - h.weekly_avg) / GREATEST(h.weekly_avg, 1)) * 100, 2) as percent_increase,
    CASE 
      WHEN w.last_week >= 5 AND ((w.last_week - h.weekly_avg) / GREATEST(h.weekly_avg, 1)) >= 0.25 THEN true
      ELSE false
    END as is_outbreak_warning
  FROM weekly_stats w
  JOIN historical_stats h ON w.symptom_name = h.symptom_name
  ORDER BY percent_increase DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ====================================================================
-- 5. RE-TRIGGER BACKFILL TO ASSIGN STANDARDIZED TERMINOLOGY TO 100% DATA
-- ====================================================================

-- Force an update on anamnesis extractions so the new trigger runs and populates
-- codes and standardized terminologies to all historical extractions instantly.
UPDATE public.anamnesis_extractions 
  SET updated_at = now() 
  WHERE extraction_result IS NOT NULL 
    AND extraction_result <> '{}'::jsonb;

-- Refresh the materialized view for the first time
REFRESH MATERIALIZED VIEW public.clinical_gold_seasonal_metrics;
