-- Keep Brazilian (BRL) and Argentine (ARS) wallets isolated.
-- Existing amounts and historical rows are deliberately NOT converted or rewritten.
-- The two legacy RPCs silently used the ARS default when writing wallet ledger
-- rows; one also hardcoded ARS for the approved appointment payment.
--
-- Copy each existing SECURITY DEFINER function's definition, update only its
-- currency-sensitive SQL, and restore it with all original grants and behavior.
-- If the deployed function has drifted, abort rather than guessing.

DO $migration$
DECLARE
  function_ddl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO function_ddl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'grant_patient_wallet_credit';

  IF function_ddl IS NULL
     OR position(E'    amount_cents,\n    balance_after_cents,' IN function_ddl) = 0
     OR position(E'    p_amount_cents,\n    v_wallet.available_credit_cents,' IN function_ddl) = 0
  THEN
    RAISE EXCEPTION 'grant_patient_wallet_credit definition drifted: review migration';
  END IF;

  function_ddl := replace(function_ddl,
    E'    amount_cents,\n    balance_after_cents,',
    E'    amount_cents,\n    currency,\n    balance_after_cents,');
  function_ddl := replace(function_ddl,
    E'    p_amount_cents,\n    v_wallet.available_credit_cents,',
    E'    p_amount_cents,\n    v_wallet.currency,\n    v_wallet.available_credit_cents,');
  EXECUTE function_ddl;

  SELECT pg_get_functiondef(p.oid) INTO function_ddl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'pay_appointment_with_patient_wallet';

  IF function_ddl IS NULL
     OR position(E'    amount_cents,\n    balance_after_cents,' IN function_ddl) = 0
     OR position(E'    v_amount_cents,\n    v_wallet.available_credit_cents,' IN function_ddl) = 0
     OR position(E'    v_amount_cents,\n    ''ARS'',\n    ''approved'',' IN function_ddl) = 0
  THEN
    RAISE EXCEPTION 'pay_appointment_with_patient_wallet definition drifted: review migration';
  END IF;

  function_ddl := replace(function_ddl,
    E'    amount_cents,\n    balance_after_cents,',
    E'    amount_cents,\n    currency,\n    balance_after_cents,');
  function_ddl := replace(function_ddl,
    E'    v_amount_cents,\n    v_wallet.available_credit_cents,',
    E'    v_amount_cents,\n    v_wallet.currency,\n    v_wallet.available_credit_cents,');
  function_ddl := replace(function_ddl,
    E'    v_amount_cents,\n    ''ARS'',\n    ''approved'',',
    E'    v_amount_cents,\n    v_wallet.currency,\n    ''approved'',');
  -- Protect against a pre-existing payment of another denomination.
  function_ddl := replace(function_ddl,
    '  if v_wallet.available_credit_cents < v_amount_cents then',
    E'  if v_payment.id is not null and v_payment.currency is distinct from v_wallet.currency then\n    raise exception ''billing_currency_conflict'';\n  end if;\n\n  if v_wallet.available_credit_cents < v_amount_cents then');
  EXECUTE function_ddl;
END
$migration$;
