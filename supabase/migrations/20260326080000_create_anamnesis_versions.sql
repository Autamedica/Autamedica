-- Anamnesis Versions: historial versionado de vida médica del paciente.
-- Cada vez que el paciente completa o actualiza su historia clínica,
-- se crea un snapshot inmutable con diff contra la versión anterior.

CREATE TABLE anamnesis_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anamnesis_id uuid NOT NULL REFERENCES anamnesis(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  version_number int NOT NULL DEFAULT 1,
  trigger text NOT NULL CHECK (trigger IN ('initial', 'update', 'review')),
  sections_snapshot jsonb NOT NULL DEFAULT '[]',
  extraction_snapshot jsonb,
  changes_summary jsonb,
  pdf_filename text,
  pdf_storage_key text,
  pdf_generated_at timestamptz,
  relevance text CHECK (relevance IN ('routine', 'new_symptom', 'follow_up', 'emergency')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anamnesis_id, version_number)
);

CREATE INDEX idx_anamnesis_versions_patient ON anamnesis_versions(patient_id);
CREATE INDEX idx_anamnesis_versions_anamnesis ON anamnesis_versions(anamnesis_id);

-- RLS
ALTER TABLE anamnesis_versions ENABLE ROW LEVEL SECURITY;

-- Patients can read their own versions
CREATE POLICY anamnesis_versions_patient_select ON anamnesis_versions
  FOR SELECT USING (patient_id IN (
    SELECT id FROM patients WHERE user_id = auth.uid()
  ));

-- Versions are created by the system (service role), not directly by patients
-- No INSERT/UPDATE/DELETE policies for authenticated users — only service role can write
