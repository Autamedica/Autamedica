-- Add bank account and consultation fee visibility to doctors table
-- Requested by Dr. Gabriel Augusto Castro to manage payment settings from profile

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_cbu_cvu text,
  ADD COLUMN IF NOT EXISTS bank_alias text;

-- Add comments for documentation
COMMENT ON COLUMN public.doctors.bank_name IS 'Nombre del banco o entidad financiera del médico';
COMMENT ON COLUMN public.doctors.bank_cbu_cvu IS 'CBU o CVU del médico para recibir pagos';
COMMENT ON COLUMN public.doctors.bank_alias IS 'Alias bancario del médico para recibir pagos';
COMMENT ON COLUMN public.doctors.consultation_fee IS 'Valor de la consulta en centavos (ARS)';
