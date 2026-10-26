-- New wallets must never default to ARS for a Brazilian patient.
-- Preserve every existing wallet's currency and balances unchanged.
-- Identity evidence comes from the persisted patient record, not the mobile client.
CREATE OR REPLACE FUNCTION public.ensure_patient_wallet(p_patient_id uuid)
RETURNS public.patient_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_wallet public.patient_wallets;
  v_cpf text;
  v_dni text;
  v_currency text;
BEGIN
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_id_required';
  END IF;

  -- Existing ledgers must never be converted by the wallet initialization path.
  SELECT * INTO v_wallet
  FROM public.patient_wallets
  WHERE patient_id = p_patient_id;

  IF FOUND THEN
    RETURN v_wallet;
  END IF;

  SELECT NULLIF(btrim(p.cpf::text), ''), NULLIF(btrim(p.dni::text), '')
    INTO v_cpf, v_dni
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_found';
  END IF;

  IF v_cpf IS NOT NULL AND v_dni IS NULL THEN
    v_currency := 'BRL';
  ELSIF v_dni IS NOT NULL AND v_cpf IS NULL THEN
    v_currency := 'ARS';
  ELSIF v_cpf IS NOT NULL AND v_dni IS NOT NULL THEN
    RAISE EXCEPTION 'billing_currency_conflict';
  ELSE
    RAISE EXCEPTION 'billing_currency_unresolved';
  END IF;

  INSERT INTO public.patient_wallets (patient_id, currency)
  VALUES (p_patient_id, v_currency)
  ON CONFLICT (patient_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.patient_wallets
  WHERE patient_id = p_patient_id;

  -- Concurrent initialization may not change this patient's jurisdiction.
  IF v_wallet.currency IS DISTINCT FROM v_currency THEN
    RAISE EXCEPTION 'billing_currency_conflict';
  END IF;

  RETURN v_wallet;
END;
$function$;
