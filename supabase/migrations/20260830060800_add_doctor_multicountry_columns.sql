-- Add multi-country onboarding columns to doctors table
-- Supports Brazil (CRM, UF, CPF, RQE, Pix) and Uruguay (MSP, CI, Bank Account)

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS license_type TEXT DEFAULT 'MN'
    CHECK (license_type IN ('MN', 'MP', 'CRM', 'CRO', 'CRF', 'RMS', 'MSP')),
  ADD COLUMN IF NOT EXISTS uf_brazil TEXT
    CHECK (uf_brazil IS NULL OR uf_brazil IN (
      'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
      'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
      'RS','RO','RR','SC','SP','SE','TO'
    )),
  ADD COLUMN IF NOT EXISTS rqe_number TEXT,
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS payout_pix_key TEXT;

-- CPF index for fast lookups on Brazilian doctors
CREATE INDEX IF NOT EXISTS idx_doctors_cpf ON public.doctors (cpf) WHERE cpf IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.doctors.license_type IS 'Type of medical license: MN/MP (Argentina), CRM/CRO/CRF/RMS (Brazil), MSP (Uruguay)';
COMMENT ON COLUMN public.doctors.uf_brazil IS 'Brazilian state (UF) of CRM registration';
COMMENT ON COLUMN public.doctors.rqe_number IS 'RQE - Registro de Qualificação de Especialista (Brazil)';
COMMENT ON COLUMN public.doctors.cpf IS 'CPF number for Brazilian doctors (11 digits)';
COMMENT ON COLUMN public.doctors.payout_pix_key IS 'Pix key for Brazilian doctor payouts (CPF, email, phone, or random key)';
