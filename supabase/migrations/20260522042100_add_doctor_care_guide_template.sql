-- Migration: Add care_guide_template to doctors table to allow physicians to choose personalized communication styles.
-- Timestamp: 20260522042100

-- Add column with check constraint for allowed templates
ALTER TABLE public.doctors 
ADD COLUMN IF NOT EXISTS care_guide_template text DEFAULT 'neutral';

-- Add check constraint to ensure only valid templates are selected
ALTER TABLE public.doctors
DROP CONSTRAINT IF EXISTS check_care_guide_template_validity,
ADD CONSTRAINT check_care_guide_template_validity 
CHECK (care_guide_template IN ('neutral', 'female', 'empathetic'));

-- Grant access on the new column (default columns inherit public/authenticated grants on public.doctors)
COMMENT ON COLUMN public.doctors.care_guide_template IS 'Selected AI care guide template for patients: neutral, female (female-concordant), or empathetic.';
