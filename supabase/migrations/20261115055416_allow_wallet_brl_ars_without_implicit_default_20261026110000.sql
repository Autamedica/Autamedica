-- Market-specific wallet balances: BRL in Brazil, ARS in Argentina.
-- Deliberately do not update or convert ANY existing balances, payments or ledger entries.
-- A migration that only changes wallet RPCs will not work: the original 20260602
-- CHECK constraints explicitly reject every BRL wallet and ledger movement.
--
-- Fail closed on an unknown schema rather than silently relaxing other checks.
DO $migration$
DECLARE
  wallet_check text;
  ledger_check text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO wallet_check
    FROM pg_constraint
   WHERE conrelid = 'public.patient_wallets'::regclass
     AND conname = 'patient_wallets_currency_check';
  SELECT pg_get_constraintdef(oid) INTO ledger_check
    FROM pg_constraint
   WHERE conrelid = 'public.patient_wallet_ledger'::regclass
     AND conname = 'patient_wallet_ledger_currency_check';

  IF wallet_check IS NULL OR ledger_check IS NULL
      OR wallet_check NOT ILIKE '%currency = ''ARS''%'
      OR ledger_check NOT ILIKE '%currency = ''ARS''%' THEN
    RAISE EXCEPTION 'Wallet currency constraints drifted: manual schema review required';
  END IF;
END;
$migration$;

ALTER TABLE public.patient_wallets
  DROP CONSTRAINT patient_wallets_currency_check,
  ADD CONSTRAINT patient_wallets_currency_check
    CHECK (currency IN ('ARS', 'BRL'));

ALTER TABLE public.patient_wallet_ledger
  DROP CONSTRAINT patient_wallet_ledger_currency_check,
  ADD CONSTRAINT patient_wallet_ledger_currency_check
    CHECK (currency IN ('ARS', 'BRL'));

-- No implicit Argentinian wallet/ledger creation for an unidentified Brazilian.
-- All current wallet write RPCs and ensure_patient_wallet explicitly supply currency.
ALTER TABLE public.patient_wallets ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.patient_wallet_ledger ALTER COLUMN currency DROP DEFAULT;
