ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS pdf_sha256 text,
  ADD COLUMN IF NOT EXISTS pdf_byte_length bigint,
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS pdf_integrity_captured_at timestamptz;

ALTER TABLE public.memed_prescriptions
  ADD COLUMN IF NOT EXISTS pdf_sha256 text,
  ADD COLUMN IF NOT EXISTS pdf_byte_length bigint,
  ADD COLUMN IF NOT EXISTS pdf_integrity_captured_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.prescriptions'::regclass AND conname = 'prescriptions_pdf_sha256_format_check') THEN
    ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_pdf_sha256_format_check CHECK (pdf_sha256 IS NULL OR pdf_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.prescriptions'::regclass AND conname = 'prescriptions_pdf_byte_length_check') THEN
    ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_pdf_byte_length_check CHECK (pdf_byte_length IS NULL OR pdf_byte_length > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.memed_prescriptions'::regclass AND conname = 'memed_prescriptions_pdf_sha256_format_check') THEN
    ALTER TABLE public.memed_prescriptions ADD CONSTRAINT memed_prescriptions_pdf_sha256_format_check CHECK (pdf_sha256 IS NULL OR pdf_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.memed_prescriptions'::regclass AND conname = 'memed_prescriptions_pdf_byte_length_check') THEN
    ALTER TABLE public.memed_prescriptions ADD CONSTRAINT memed_prescriptions_pdf_byte_length_check CHECK (pdf_byte_length IS NULL OR pdf_byte_length > 0);
  END IF;
END
$$;
