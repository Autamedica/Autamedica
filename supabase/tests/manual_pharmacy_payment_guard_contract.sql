-- Contract regression test for the audited manual approval RPC.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.admin_manual_approve_pharmacy_payment(uuid,uuid,text,text)'::regprocedure
  ) INTO definition;

  IF position('active_admin_required' IN definition) = 0
     OR position('role IN (''admin'', ''platform_admin'', ''organization_admin'')' IN definition) = 0 THEN
    RAISE EXCEPTION 'active administrator authorization is missing';
  END IF;

  IF position('v_payment.provider NOT IN (''manual'', ''mercadopago'')' IN definition) = 0
     OR position('MANUAL_PILOT_PAYMENT_REQUIRED' IN definition) = 0 THEN
    RAISE EXCEPTION 'supported payment providers or manual_pilot eligibility guard is missing';
  END IF;

  IF position('MANUAL_OVERRIDE_' IN definition) = 0
     OR position('manual_override_evidence_reference' IN definition) = 0
     OR position('manual_override_type' IN definition) = 0 THEN
    RAISE EXCEPTION 'synthetic internal reference and explicit override metadata are missing';
  END IF;

  IF position('pharmacy_payment_manual_override_approved' IN definition) = 0
     OR position('approved_by' IN definition) = 0 THEN
    RAISE EXCEPTION 'administrator audit record is missing';
  END IF;

  IF position('DISPATCH_REQUEST_TERMINAL' IN definition) = 0
     OR position('PHARMACY_PAYMENT_PRICE_MISMATCH' IN definition) = 0
     OR position('activate_paid_pharmacy_dispatch' IN definition) > 0 THEN
    RAISE EXCEPTION 'dispatch/payment guards or trigger-owned activation contract changed';
  END IF;
END;
$$;
