-- Run ONLY against disposable local CI Postgres, after replaying all migrations.
DO $test$
DECLARE
  f regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.patient_wallets'::regclass
      AND conname = 'patient_wallets_currency_check'
      AND pg_get_constraintdef(oid) LIKE '%BRL%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.patient_wallet_ledger'::regclass
      AND conname = 'patient_wallet_ledger_currency_check'
      AND pg_get_constraintdef(oid) LIKE '%BRL%'
  ) THEN
    RAISE EXCEPTION 'BRL and ARS wallet constraints are not deployed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('patient_wallets','patient_wallet_ledger')
      AND column_name='currency' AND column_default IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Wallet currencies must not default to a foreign market';
  END IF;

  IF has_function_privilege('anon',
      'public.pay_appointment_with_patient_wallet(uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.pay_appointment_with_patient_wallet(uuid,uuid,text)', 'EXECUTE')
    OR has_function_privilege('anon',
      'public.ensure_patient_wallet(uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.ensure_patient_wallet(uuid)', 'EXECUTE')
    OR has_function_privilege('anon',
      'public.patient_wallet_get_balance(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Sensitive patient-wallet RPC is publicly executable';
  END IF;

  IF NOT has_function_privilege('service_role',
      'public.pay_appointment_with_patient_wallet(uuid,uuid,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.patient_wallet_get_balance(uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated',
      'public.patient_wallet_get_balance(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Required authorized wallet role lost its permission';
  END IF;

  f := to_regprocedure(
    'public.confirm_mobile_appointment_payment(uuid,uuid,uuid,integer,text,text,timestamp with time zone)'
  );
  IF f IS NULL THEN
    RAISE EXCEPTION 'Mobile payment atomic RPC missing';
  END IF;
  IF has_function_privilege('anon', f, 'EXECUTE')
    OR has_function_privilege('authenticated', f, 'EXECUTE')
    OR NOT has_function_privilege('service_role', f, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Mobile payment confirmation has unsafe execute permissions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = f AND prosecdef
  ) THEN
    RAISE EXCEPTION 'Mobile payment RPC must lock records as security definer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.appointments'::regclass
      AND tgname='trg_enqueue_doctor_confirmed_appointment' AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'Paid appointment must enqueue clinical notification';
  END IF;

  RAISE NOTICE 'Mobile wallet/payments country and access smoke passed';
END;
$test$;
