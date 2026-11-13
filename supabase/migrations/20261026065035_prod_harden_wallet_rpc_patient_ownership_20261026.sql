-- Critical permission boundary: wallet credit and payment RPCs bypass RLS.
-- Only service-role checkout code may debit or create a wallet directly.
REVOKE EXECUTE ON FUNCTION public.ensure_patient_wallet(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_patient_wallet(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.pay_appointment_with_patient_wallet(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_appointment_with_patient_wallet(uuid, uuid, text) TO service_role;

-- Preserve legitimate patient balance reads, but never allow a user to pass
-- another patient's UUID. SECURITY DEFINER would otherwise bypass table RLS.
CREATE OR REPLACE FUNCTION public.patient_wallet_get_balance(
  p_patient_id uuid DEFAULT NULL
)
RETURNS TABLE (
  patient_id uuid,
  available_credit_cents bigint,
  locked_credit_cents bigint,
  total_credit_cents bigint,
  currency text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_patient_id uuid;
  v_wallet public.patient_wallets;
BEGIN
  IF p_patient_id IS NOT NULL THEN
    v_patient_id := p_patient_id;
  ELSE
    SELECT p.id INTO v_patient_id
      FROM public.patients p
     WHERE p.user_id = auth.uid()
     LIMIT 1;
  END IF;

  IF v_patient_id IS NULL THEN
    RETURN;
  END IF;

  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.id = v_patient_id AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'patient_wallet_access_denied'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_wallet := public.ensure_patient_wallet(v_patient_id);
  patient_id := v_patient_id;
  available_credit_cents := v_wallet.available_credit_cents;
  locked_credit_cents := v_wallet.locked_credit_cents;
  total_credit_cents := v_wallet.available_credit_cents + v_wallet.locked_credit_cents;
  currency := v_wallet.currency;
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.patient_wallet_get_balance(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_wallet_get_balance(uuid)
  TO authenticated, service_role;
