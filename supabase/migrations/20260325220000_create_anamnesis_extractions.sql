-- Stores AI-extracted structured data from patient anamnesis.
-- Two checkpoints: 'partial' (after step 6) and 'final' (after step 13).
-- Upsert on (anamnesis_id, checkpoint) — one record per checkpoint.

CREATE TABLE IF NOT EXISTS public.anamnesis_extractions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  anamnesis_id uuid NOT NULL REFERENCES public.anamnesis(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  checkpoint text NOT NULL CHECK (checkpoint IN ('partial', 'final')),
  extraction_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  sections_count integer NOT NULL DEFAULT 0,
  has_critical_questions boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anamnesis_id, checkpoint)
);

-- Index for patient lookups
CREATE INDEX IF NOT EXISTS idx_anamnesis_extractions_patient
  ON public.anamnesis_extractions(patient_id);

-- RLS
ALTER TABLE public.anamnesis_extractions ENABLE ROW LEVEL SECURITY;

-- Patients can read their own extractions
CREATE POLICY "Patients read own extractions"
  ON public.anamnesis_extractions FOR SELECT
  USING (patient_id IN (
    SELECT id FROM public.patients WHERE user_id = auth.uid()
  ));

-- Service role can insert/update (API endpoints use admin client)
CREATE POLICY "Service role manages extractions"
  ON public.anamnesis_extractions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_anamnesis_extractions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_anamnesis_extractions_updated_at
  BEFORE UPDATE ON public.anamnesis_extractions
  FOR EACH ROW EXECUTE FUNCTION public.update_anamnesis_extractions_updated_at();
