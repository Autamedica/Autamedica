-- Payment-first lifecycle for Pharmacy Express. Checkout time is not clinical search time.
ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS payment_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS search_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_activation_result jsonb;

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_pending_payment
  ON public.pharmacy_dispatch_requests (created_at)
  WHERE status = 'pending_payment';

-- Preserve the existing cleanup behavior while excluding payment and checkout sessions.
CREATE OR REPLACE FUNCTION public.expire_stale_dispatch_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_request public.pharmacy_dispatch_requests%ROWTYPE;
  p public.pharmacy_dispatch_payments%ROWTYPE;
  v_search_expired integer := 0;
  v_matched_expired integer := 0;
  v_in_call_cancelled integer := 0;
  v_calls_closed integer := 0;
  v_approval_count integer := 0;
  v_doctors_released integer := 0;
  v_count integer := 0;
BEGIN
  FOR v_request IN
    SELECT *
    FROM public.pharmacy_dispatch_requests req
    WHERE req.status = 'searching'
      AND COALESCE(req.search_timeout_at,
                   COALESCE(req.search_started_at, req.created_at) + interval '25 seconds') <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.pharmacy_dispatch_payments active_payment
        WHERE active_payment.dispatch_request_id = req.id
          AND active_payment.status IN ('initializing', 'pending', 'pending_payment')
      )
    FOR UPDATE OF req SKIP LOCKED
  LOOP
    UPDATE public.pharmacy_dispatch_requests
       SET status = 'expired', updated_at = now()
     WHERE id = v_request.id AND status = 'searching';
    IF NOT FOUND THEN CONTINUE; END IF;
    v_search_expired := v_search_expired + 1;

    SELECT * INTO p
    FROM public.pharmacy_dispatch_payments
    WHERE dispatch_request_id = v_request.id AND status = 'approved'
    ORDER BY paid_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO public.admin_approval_decisions
        (domain, status, proposed_by, summary, risk_reason, impact_scope, payload)
      VALUES
        ('money', 'PENDING_HUMAN_APPROVAL', 'system',
         'Consulta QR pagada expiró sin médico asignado',
         'Pago aprobado sin asignación médica antes del vencimiento',
         'Despacho farmacéutico; reapertura de búsqueda o reembolso del pago',
         jsonb_build_object(
           'action_type', 'expired_paid_dispatch',
           'dispatch_request_id', v_request.id,
           'payment_id', p.id,
           'mp_payment_id', p.provider_payment_id,
           'amount', p.amount_minor / 100.0
         ))
      ON CONFLICT ((payload->>'dispatch_request_id'))
        WHERE payload->>'action_type' = 'expired_paid_dispatch'
      DO NOTHING;
      IF FOUND THEN v_approval_count := v_approval_count + 1; END IF;
    END IF;
  END LOOP;

  UPDATE public.pharmacy_dispatch_requests AS req
     SET status = 'expired', updated_at = now()
   WHERE req.status = 'matched'
     AND coalesce(req.matched_at, req.updated_at, req.created_at) < now() - interval '60 minutes';
  GET DIAGNOSTICS v_matched_expired = ROW_COUNT;

  UPDATE public.calls AS c
     SET status = CASE WHEN c.status::text = 'connecting' THEN 'ended'::public.call_status
                       ELSE 'canceled'::public.call_status END,
         reason = coalesce(c.reason, 'stale_call_timeout')
   WHERE c.status::text IN ('requested', 'ringing', 'accepted', 'connecting')
     AND c.created_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_calls_closed = ROW_COUNT;

  UPDATE public.pharmacy_dispatch_requests AS req
     SET status = 'cancelled',
         call_ended_at = coalesce(req.call_ended_at, now()),
         updated_at = now()
    FROM public.calls AS c
   WHERE req.status = 'in_call'
     AND req.call_id = c.id
     AND (
       c.status::text IN ('ended', 'canceled', 'declined')
       OR coalesce(c.ended_at, req.updated_at, req.call_started_at, req.created_at)
            < now() - interval '3 hours'
     );
  GET DIAGNOSTICS v_in_call_cancelled = ROW_COUNT;

  UPDATE public.pharmacy_dispatch_requests AS req
     SET status = 'cancelled',
         call_ended_at = coalesce(req.call_ended_at, now()),
         updated_at = now()
   WHERE req.status = 'in_call'
     AND req.call_id IS NULL
     AND coalesce(req.updated_at, req.call_started_at, req.created_at) < now() - interval '3 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_in_call_cancelled := v_in_call_cancelled + v_count;

  UPDATE public.doctor_duty_status AS duty
     SET current_active_request_id = NULL
   WHERE duty.current_active_request_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.pharmacy_dispatch_requests AS req
       WHERE req.id = duty.current_active_request_id
         AND req.status::text IN ('matched', 'in_call')
     );
  GET DIAGNOSTICS v_doctors_released = ROW_COUNT;

  RETURN jsonb_build_object(
    'search_expired_count', v_search_expired,
    'matched_expired_count', v_matched_expired,
    'in_call_cancelled_count', v_in_call_cancelled,
    'calls_closed_count', v_calls_closed,
    'doctor_slots_released_count', v_doctors_released,
    'approval_count', v_approval_count,
    'executed_at', now()
  );
END;
$function$;

-- Single activation path for Mercado Pago webhooks and audited manual settlement.
CREATE OR REPLACE FUNCTION public.activate_paid_pharmacy_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $function$
DECLARE
  v_status text;
  v_result jsonb;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;
  IF NEW.paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.pharmacy_dispatch_requests
     SET status = 'searching',
         search_started_at = COALESCE(search_started_at, now()),
         search_timeout_at = now() + interval '25 seconds',
         updated_at = now()
   WHERE id = NEW.dispatch_request_id
     AND status = 'pending_payment'
  RETURNING status::text INTO v_status;

  IF NOT FOUND THEN
    SELECT status::text INTO v_status
    FROM public.pharmacy_dispatch_requests
    WHERE id = NEW.dispatch_request_id;
  END IF;

  IF v_status = 'searching' THEN
    UPDATE public.pharmacy_dispatch_requests
       SET search_started_at = COALESCE(search_started_at, now()),
           search_timeout_at = now() + interval '25 seconds',
           updated_at = now()
     WHERE id = NEW.dispatch_request_id;
    v_result := public.match_dispatch_doctors(NEW.dispatch_request_id);
    UPDATE public.pharmacy_dispatch_requests
       SET dispatch_activation_result = v_result,
           updated_at = now()
     WHERE id = NEW.dispatch_request_id;
  ELSE
    v_result := jsonb_build_object(
      'success', false,
      'code', 'REQUEST_NOT_SEARCHING',
      'request_status', v_status
    );
    UPDATE public.pharmacy_dispatch_requests
       SET dispatch_activation_result = v_result,
           updated_at = now()
     WHERE id = NEW.dispatch_request_id;

    IF v_status = 'expired' THEN
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
           'amount', NEW.amount_minor / 100.0
         ))
      ON CONFLICT ((payload->>'dispatch_request_id'))
        WHERE payload->>'action_type' = 'expired_paid_dispatch'
      DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_jordan_dispatch_after_payment_approval
  ON public.pharmacy_dispatch_payments;
DROP TRIGGER IF EXISTS trg_activate_paid_pharmacy_dispatch
  ON public.pharmacy_dispatch_payments;
CREATE TRIGGER trg_activate_paid_pharmacy_dispatch
AFTER INSERT OR UPDATE OF status ON public.pharmacy_dispatch_payments
FOR EACH ROW
WHEN (NEW.status = 'approved')
EXECUTE FUNCTION public.activate_paid_pharmacy_dispatch();

-- Keep country/price validation and manual evidence; report success only when dispatch really starts.
CREATE OR REPLACE FUNCTION public.admin_manual_approve_pharmacy_payment(
  p_payment_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_evidence_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'app_private'
AS $function$
DECLARE
  v_payment public.pharmacy_dispatch_payments%ROWTYPE;
  v_request public.pharmacy_dispatch_requests%ROWTYPE;
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
  v_original_provider_payment_id text;
  v_override_at timestamptz := now();
  v_dispatch_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = p_actor_id
      AND active IS TRUE
      AND role IN ('admin', 'platform_admin', 'organization_admin')
  ) THEN
    RAISE EXCEPTION 'active_admin_required' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 OR length(p_reason) > 2000
     OR p_evidence_reference IS NULL OR length(btrim(p_evidence_reference)) < 4
     OR length(p_evidence_reference) > 300 THEN
    RAISE EXCEPTION 'manual_override_reason_and_evidence_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_payment
  FROM public.pharmacy_dispatch_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_FOUND');
  END IF;
  IF v_payment.status NOT IN ('pending', 'pending_payment') THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_PENDING');
  END IF;

  SELECT * INTO v_request
  FROM public.pharmacy_dispatch_requests
  WHERE id = v_payment.dispatch_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'REQUEST_NOT_FOUND');
  END IF;

  SELECT * INTO v_config
  FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code = v_request.care_country;
  IF NOT FOUND
     OR v_payment.currency IS DISTINCT FROM v_config.currency
     OR v_payment.amount_minor IS DISTINCT FROM v_config.consultation_price_minor THEN
    RETURN jsonb_build_object('success', false, 'code', 'PHARMACY_PAYMENT_PRICE_MISMATCH');
  END IF;

  v_original_provider_payment_id := v_payment.provider_payment_id;
  UPDATE public.pharmacy_dispatch_payments
     SET status = 'approved',
         provider_payment_id = CASE
           WHEN provider = 'mercadopago' AND provider_payment_id ~ '^[0-9]{1,20}$'
             THEN provider_payment_id
           ELSE 'MANUAL_OVERRIDE_' || p_actor_id::text
         END,
         paid_at = COALESCE(paid_at, v_override_at),
         metadata = jsonb_set(
           jsonb_set(
             jsonb_set(
               jsonb_set(
                 jsonb_set(COALESCE(metadata, '{}'::jsonb),
                   '{manual_override_by}', to_jsonb(p_actor_id), true),
                 '{manual_override_at}', to_jsonb(v_override_at), true),
               '{manual_override_reason}', to_jsonb(btrim(p_reason)), true),
             '{manual_override_evidence_reference}', to_jsonb(btrim(p_evidence_reference)), true),
           '{manual_approval_pending}', 'false'::jsonb, true)
   WHERE id = p_payment_id
   RETURNING * INTO v_payment;

  SELECT * INTO v_request
  FROM public.pharmacy_dispatch_requests
  WHERE id = v_payment.dispatch_request_id;

  v_dispatch_result := COALESCE(
    v_request.dispatch_activation_result,
    jsonb_build_object(
      'success', false,
      'code', 'DISPATCH_RESULT_UNAVAILABLE',
      'request_status', v_request.status::text
    )
  );

  INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_actor_id,
    'pharmacy_payment_manual_override_approved',
    'pharmacy_dispatch_payments',
    v_payment.id,
    jsonb_build_object(
      'dispatch_request_id', v_payment.dispatch_request_id,
      'country_code', v_request.care_country,
      'currency', v_payment.currency,
      'amount_minor', v_payment.amount_minor,
      'provider_payment_id', v_payment.provider_payment_id,
      'original_provider_payment_id', v_original_provider_payment_id,
      'manual_override_at', v_payment.paid_at,
      'reason', btrim(p_reason),
      'evidence_reference', btrim(p_evidence_reference),
      'approved_by', p_actor_id,
      'dispatch_result', v_dispatch_result
    )
  );

  RETURN jsonb_build_object(
    'success', COALESCE((v_dispatch_result->>'success')::boolean, false),
    'payment_approved', true,
    'code', CASE
      WHEN COALESCE((v_dispatch_result->>'success')::boolean, false)
        THEN 'PAYMENT_AND_DISPATCH_ACTIVATED'
      ELSE COALESCE(v_dispatch_result->>'code', 'DISPATCH_NOT_CONFIRMED')
    END,
    'payment_id', v_payment.id,
    'dispatch_request_id', v_payment.dispatch_request_id,
    'status', v_payment.status,
    'provider_payment_id', v_payment.provider_payment_id,
    'manual_override_by', p_actor_id,
    'dispatch_result', v_dispatch_result
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid, uuid, text, text)
  TO service_role;
