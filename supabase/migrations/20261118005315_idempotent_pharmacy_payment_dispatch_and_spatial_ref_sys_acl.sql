-- Idempotent activation for pharmacy payments plus spatial_ref_sys DML hardening.
-- Replayed approved payment updates repair a missed dispatch activation without
-- reopening a request that has already expired, matched, or entered a call.

CREATE OR REPLACE FUNCTION public.activate_paid_pharmacy_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $function$
DECLARE
  v_request public.pharmacy_dispatch_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF NEW.status <> 'approved' OR NEW.paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_request
    FROM public.pharmacy_dispatch_requests
   WHERE id = NEW.dispatch_request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_request.status = 'pending_payment' THEN
    UPDATE public.pharmacy_dispatch_requests
       SET status = 'searching',
           search_started_at = COALESCE(search_started_at, clock_timestamp()),
           search_timeout_at = clock_timestamp() + interval '15 minutes',
           updated_at = clock_timestamp()
     WHERE id = NEW.dispatch_request_id
     RETURNING * INTO v_request;
  ELSIF v_request.status = 'searching' THEN
    -- Preserve the original post-payment deadline on webhook/status retries.
    UPDATE public.pharmacy_dispatch_requests
       SET search_started_at = COALESCE(search_started_at, clock_timestamp()),
           search_timeout_at = COALESCE(search_timeout_at, clock_timestamp() + interval '15 minutes'),
           updated_at = clock_timestamp()
     WHERE id = NEW.dispatch_request_id
     RETURNING * INTO v_request;
  ELSE
    -- Never silently reopen an expired, matched, cancelled, or in-call request.
    IF v_request.status = 'expired' THEN
      INSERT INTO public.admin_approval_decisions
        (domain, status, proposed_by, summary, risk_reason, impact_scope, payload)
      VALUES
        ('money', 'PENDING_HUMAN_APPROVAL', 'system',
         'Pago aprobado después del vencimiento de la consulta',
         'El pago se confirmó cuando la solicitud ya no estaba buscando médico',
         'Despacho farmacéutico; reapertura de búsqueda o reembolso',
         jsonb_build_object(
           'action_type', 'expired_paid_dispatch',
           'dispatch_request_id', NEW.dispatch_request_id,
           'payment_id', NEW.id,
           'mp_payment_id', NEW.provider_payment_id,
           'amount_minor', NEW.amount_minor,
           'currency', NEW.currency
         ))
      ON CONFLICT ((payload->>'dispatch_request_id'))
        WHERE payload->>'action_type' = 'expired_paid_dispatch'
      DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;

  -- Matcher is idempotent: it returns an existing live offer, or advances to
  -- the next eligible on-duty doctor when the previous 30-second offer expired.
  v_result := public.match_dispatch_doctors(NEW.dispatch_request_id);

  UPDATE public.pharmacy_dispatch_requests
     SET dispatch_activation_result = v_result,
         updated_at = clock_timestamp()
   WHERE id = NEW.dispatch_request_id;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_paid_pharmacy_dispatch()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_pharmacy_dispatch()
  TO service_role;

-- PostGIS metadata remains readable; public clients cannot mutate the catalog.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.spatial_ref_sys
  FROM anon, authenticated;
