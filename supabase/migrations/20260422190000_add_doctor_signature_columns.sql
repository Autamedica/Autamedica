-- ============================================================
-- Add signature and stamp image columns to doctors table
-- Enables visual signature stamping on electronic prescriptions
-- ============================================================

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS signature_image_url text,
  ADD COLUMN IF NOT EXISTS stamp_image_url text;

COMMENT ON COLUMN public.doctors.signature_image_url IS
  'URL to the doctor''s handwritten signature image (PNG/WebP) stored in Supabase Storage';
COMMENT ON COLUMN public.doctors.stamp_image_url IS
  'URL to the doctor''s professional stamp/seal image (PNG/WebP) stored in Supabase Storage';
