-- Add signature and stamp columns to doctors table
-- Used for digital signing of prescriptions and professional identification

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS stamp_url text;

-- Add comments for documentation
COMMENT ON COLUMN public.doctors.signature_url IS 'URL de la imagen de la firma del médico (Storage)';
COMMENT ON COLUMN public.doctors.stamp_url IS 'URL de la imagen del sello del médico (Storage)';
