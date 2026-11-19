-- Contract regression test for the production manual-payment RPC.
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.admin_manual_approve_pharmacy_payment(uuid,uuid,text,text)'::regprocedure
  ) INTO definition;

  IF position('v_payment.provider IS DISTINCT FROM ''manual''' IN definition) = 0
     OR position('payment_mode' IN definition) = 0
     OR position('manual_approval_pending' IN definition) = 0 THEN
    RAISE EXCEPTION 'manual payment provider/mode/pending guard is missing';
  END IF;

  IF position('v_request.status::text IN (''expired'', ''cancelled'')' IN definition) = 0 THEN
    RAISE EXCEPTION 'expired/cancelled dispatch requests are not rejected';
  END IF;

  IF position('approved_pending_dispatch_resolution' IN definition) = 0
     OR position('payment_approved' IN definition) = 0 THEN
    RAISE EXCEPTION 'financial approval and dispatch result are not separated';
  END IF;
END;
$$;
