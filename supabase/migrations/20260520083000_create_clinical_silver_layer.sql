-- Migration: Create Clinical Silver Layer Tables and Trigger for AI Anamnesis Flattening
-- Timestamp: 20260520083000

-- 1. Symptom Observations Table (Capa Plata - Síntomas)
CREATE TABLE IF NOT EXISTS public.clinical_symptom_observations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  anamnesis_extraction_id uuid NOT NULL REFERENCES public.anamnesis_extractions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  symptom_name text NOT NULL,
  snomed_code text,
  is_primary boolean NOT NULL DEFAULT false,
  is_red_flag boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Patient Conditions Table (Capa Plata - Antecedentes y Estilo de Vida)
CREATE TABLE IF NOT EXISTS public.clinical_patient_conditions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  anamnesis_extraction_id uuid NOT NULL REFERENCES public.anamnesis_extractions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  condition_name text NOT NULL,
  snomed_code text,
  category text NOT NULL CHECK (category IN ('pathological', 'physiological', 'lifestyle')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for extremely fast query filtering by patient, symptom, condition, and temporal aggregates
CREATE INDEX IF NOT EXISTS idx_clinical_symptoms_patient 
  ON public.clinical_symptom_observations(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_symptoms_extraction 
  ON public.clinical_symptom_observations(anamnesis_extraction_id);
CREATE INDEX IF NOT EXISTS idx_clinical_symptoms_name 
  ON public.clinical_symptom_observations(symptom_name);
CREATE INDEX IF NOT EXISTS idx_clinical_symptoms_created 
  ON public.clinical_symptom_observations(created_at);

CREATE INDEX IF NOT EXISTS idx_clinical_conditions_patient 
  ON public.clinical_patient_conditions(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_conditions_extraction 
  ON public.clinical_patient_conditions(anamnesis_extraction_id);
CREATE INDEX IF NOT EXISTS idx_clinical_conditions_name 
  ON public.clinical_patient_conditions(condition_name);

-- Enable Row Level Security (RLS) for clinical data protection
ALTER TABLE public.clinical_symptom_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_patient_conditions ENABLE ROW LEVEL SECURITY;

-- Patients can only read their own clinical silver layer data
DROP POLICY IF EXISTS "Patients can read own clinical symptoms" ON public.clinical_symptom_observations;
CREATE POLICY "Patients can read own clinical symptoms"
  ON public.clinical_symptom_observations FOR SELECT
  USING (patient_id IN (
    SELECT id FROM public.patients WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Patients can read own clinical conditions" ON public.clinical_patient_conditions;
CREATE POLICY "Patients can read own clinical conditions"
  ON public.clinical_patient_conditions FOR SELECT
  USING (patient_id IN (
    SELECT id FROM public.patients WHERE user_id = auth.uid()
  ));

-- Service role and internal workers have full permissions
DROP POLICY IF EXISTS "Service role manages clinical symptoms" ON public.clinical_symptom_observations;
CREATE POLICY "Service role manages clinical symptoms"
  ON public.clinical_symptom_observations FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages clinical conditions" ON public.clinical_patient_conditions;
CREATE POLICY "Service role manages clinical conditions"
  ON public.clinical_patient_conditions FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. PL/pgSQL Trigger Function to parse extraction JSONB and insert flattened records
CREATE OR REPLACE FUNCTION public.process_anamnesis_extraction_silver_layer()
RETURNS TRIGGER AS $$
DECLARE
  v_chief_complaint_code text;
  v_symptom text;
  v_condition text;
  v_red_flag text;
  v_symptom_name_translated text;
BEGIN
  -- Verify extraction result is available and checkpoint is 'final' to build mature intelligence
  IF NEW.extraction_result IS NULL OR NEW.extraction_result = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- Verify patient exists in the patients table to avoid FK violation on orphaned extractions
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = NEW.patient_id) THEN
    RETURN NEW;
  END IF;

  -- Idempotency: Clean up any previous structured data for this extraction
  DELETE FROM public.clinical_symptom_observations 
    WHERE anamnesis_extraction_id = NEW.id;
  DELETE FROM public.clinical_patient_conditions 
    WHERE anamnesis_extraction_id = NEW.id;

  -- 1. Extract Primary Symptom (chiefComplaintCode)
  v_chief_complaint_code := NEW.extraction_result->'normalizedOpenFields'->>'chiefComplaintCode';
  IF v_chief_complaint_code IS NOT NULL AND v_chief_complaint_code <> 'null' THEN
    -- Mapeo semántico de queja cardinal en español
    v_symptom_name_translated := CASE v_chief_complaint_code
      WHEN 'headache' THEN 'Cefalea / Dolor de cabeza'
      WHEN 'chest_pain' THEN 'Dolor torácico / Pecho'
      WHEN 'cervical_pressure' THEN 'Presión cervical'
      WHEN 'dyspnea' THEN 'Dificultad respiratoria (Disnea)'
      WHEN 'cough' THEN 'Tos'
      WHEN 'abdominal_pain' THEN 'Dolor abdominal'
      WHEN 'digestive_symptoms' THEN 'Síntomas digestivos'
      WHEN 'genitourinary_symptoms' THEN 'Síntomas genitourinarios'
      WHEN 'palpitations' THEN 'Palpitaciones'
      WHEN 'fatigue' THEN 'Fatiga / Cansancio extremo'
      WHEN 'fever' THEN 'Fiebre / Síndrome febril'
      WHEN 'dizziness' THEN 'Mareos / Inestabilidad'
      WHEN 'back_pain' THEN 'Dorsalgia / Dolor de espalda'
      WHEN 'neuro' THEN 'Déficit o foco neurológico'
      WHEN 'mood_disorder' THEN 'Trastorno del ánimo / Ansiedad'
      ELSE 'Otros síntomas no especificados'
    END;

    INSERT INTO public.clinical_symptom_observations (
      anamnesis_extraction_id,
      patient_id,
      symptom_name,
      is_primary,
      is_red_flag,
      created_at
    ) VALUES (
      NEW.id,
      NEW.patient_id,
      v_symptom_name_translated,
      true,
      false,
      NEW.created_at
    );
  END IF;

  -- 2. Extract Associated Symptoms (presentIllness.associatedSymptoms array)
  IF NEW.extraction_result->'presentIllness'->'associatedSymptoms' IS NOT NULL THEN
    FOR v_symptom IN 
      SELECT jsonb_array_elements_text(NEW.extraction_result->'presentIllness'->'associatedSymptoms')
    LOOP
      IF v_symptom IS NOT NULL AND trim(v_symptom) <> '' THEN
        -- Normalize format: "congestión nasal" -> "Congestión nasal"
        v_symptom := initcap(trim(v_symptom));
        
        -- Evitar duplicar con síntoma primario
        IF NOT EXISTS (
          SELECT 1 FROM public.clinical_symptom_observations 
          WHERE anamnesis_extraction_id = NEW.id AND symptom_name = v_symptom
        ) THEN
          INSERT INTO public.clinical_symptom_observations (
            anamnesis_extraction_id,
            patient_id,
            symptom_name,
            is_primary,
            is_red_flag,
            created_at
          ) VALUES (
            NEW.id,
            NEW.patient_id,
            v_symptom,
            false,
            false,
            NEW.created_at
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Extract Red Flags (normalizedOpenFields.redFlagCodes array)
  IF NEW.extraction_result->'normalizedOpenFields'->'redFlagCodes' IS NOT NULL THEN
    FOR v_red_flag IN 
      SELECT jsonb_array_elements_text(NEW.extraction_result->'normalizedOpenFields'->'redFlagCodes')
    LOOP
      IF v_red_flag IS NOT NULL AND trim(v_red_flag) <> '' THEN
        -- Convert "chest_pain_exertional" to readable "Chest Pain Exertional" and format nicely
        v_symptom_name_translated := initcap(replace(trim(v_red_flag), '_', ' '));
        
        INSERT INTO public.clinical_symptom_observations (
          anamnesis_extraction_id,
          patient_id,
          symptom_name,
          is_primary,
          is_red_flag,
          created_at
        ) VALUES (
          NEW.id,
          NEW.patient_id,
          v_symptom_name_translated,
          false,
          true,
          NEW.created_at
        );
      END IF;
    END LOOP;
  END IF;

  -- 4. Extract Pathological Conditions (personalHistory.pathological array)
  IF NEW.extraction_result->'personalHistory'->'pathological' IS NOT NULL THEN
    FOR v_condition IN 
      SELECT jsonb_array_elements_text(NEW.extraction_result->'personalHistory'->'pathological')
    LOOP
      IF v_condition IS NOT NULL AND trim(v_condition) <> '' THEN
        INSERT INTO public.clinical_patient_conditions (
          anamnesis_extraction_id,
          patient_id,
          condition_name,
          category,
          created_at
        ) VALUES (
          NEW.id,
          NEW.patient_id,
          initcap(trim(v_condition)),
          'pathological',
          NEW.created_at
        );
      END IF;
    END LOOP;
  END IF;

  -- 5. Extract Physiological Conditions (personalHistory.physiological array)
  IF NEW.extraction_result->'personalHistory'->'physiological' IS NOT NULL THEN
    FOR v_condition IN 
      SELECT jsonb_array_elements_text(NEW.extraction_result->'personalHistory'->'physiological')
    LOOP
      IF v_condition IS NOT NULL AND trim(v_condition) <> '' THEN
        INSERT INTO public.clinical_patient_conditions (
          anamnesis_extraction_id,
          patient_id,
          condition_name,
          category,
          created_at
        ) VALUES (
          NEW.id,
          NEW.patient_id,
          initcap(trim(v_condition)),
          'physiological',
          NEW.created_at
        );
      END IF;
    END LOOP;
  END IF;

  -- 6. Extract Lifestyle Conditions (personalHistory.lifestyleAndContext array)
  IF NEW.extraction_result->'personalHistory'->'lifestyleAndContext' IS NOT NULL THEN
    FOR v_condition IN 
      SELECT jsonb_array_elements_text(NEW.extraction_result->'personalHistory'->'lifestyleAndContext')
    LOOP
      IF v_condition IS NOT NULL AND trim(v_condition) <> '' THEN
        INSERT INTO public.clinical_patient_conditions (
          anamnesis_extraction_id,
          patient_id,
          condition_name,
          category,
          created_at
        ) VALUES (
          NEW.id,
          NEW.patient_id,
          initcap(trim(v_condition)),
          'lifestyle',
          NEW.created_at
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Set trigger on anamnesis_extractions
CREATE OR REPLACE TRIGGER trg_process_anamnesis_extraction_silver_layer
  AFTER INSERT OR UPDATE ON public.anamnesis_extractions
  FOR EACH ROW
  EXECUTE FUNCTION public.process_anamnesis_extraction_silver_layer();
