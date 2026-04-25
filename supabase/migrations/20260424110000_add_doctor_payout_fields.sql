ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS payout_cbu TEXT,
  ADD COLUMN IF NOT EXISTS payout_alias TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doctors_payout_cbu_format_check'
  ) THEN
    ALTER TABLE public.doctors
      ADD CONSTRAINT doctors_payout_cbu_format_check
      CHECK (
        payout_cbu IS NULL
        OR payout_cbu ~ '^[0-9]{22}$'
      );
  END IF;
END $$;

COMMENT ON COLUMN public.doctors.payout_cbu IS 'CBU del medico para recibir cobros de consultas.';
COMMENT ON COLUMN public.doctors.payout_alias IS 'Alias bancario opcional para cobros del medico.';
