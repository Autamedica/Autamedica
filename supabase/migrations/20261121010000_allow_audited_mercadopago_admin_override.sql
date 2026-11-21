-- Audited administrator override for pending Mercado Pago and manual-pilot pharmacy payments.
-- This is an explicit accounting/operational exception, not PSP verification.
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
  v_override_at timestamptz := clock_timestamp();
  v_dispatch_result jsonb;
  v_dispatch_success boolean := false;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_actor_id AND active IS TRUE
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
    RETURN jsonb_build_object('success', false, 'payment_approved', false, 'code', 'PAYMENT_NOT_FOUND');
  END IF;

  -- Idempotent replay: preserve the original provider identity and audit record.
  IF v_payment.status = 'approved'
     AND COALESCE(v_payment.metadata->>'manual_override_by', '') <> '' THEN
    SELECT * INTO v_request
    FROM public.pharmacy_dispatch_requests
    WHERE id = v_payment.dispatch_request_id;
    v_dispatch_result := COALESCE(
      v_request.dispatch_activation_result,
      jsonb_build_object('success', false, 'code', 'DISPATCH_RESULT_UNAVAILABLE',
        'request_status', v_request.status::text)
    );
    RETURN jsonb_build_object(
      'success', true, 'payment_approved', true, 'already_approved', true,
      'code', 'PAYMENT_ALREADY_APPROVED',
      'status', CASE WHEN COALESCE((v_dispatch_result->>'success')::boolean, false)
        THEN 'approved' ELSE 'approved_pending_dispatch_resolution' END,
      'payment_id', v_payment.id, 'dispatch_request_id', v_payment.dispatch_request_id,
      'provider', v_payment.provider, 'provider_payment_id', v_payment.provider_payment_id,
      'dispatch_status', v_request.status::text, 'dispatch_result', v_dispatch_result
    );
  END IF;

  IF v_payment.provider NOT IN ('manual', 'mercadopago') THEN
    RETURN jsonb_build_object('success', false, 'payment_approved', false, 'code', 'UNSUPPORTED_PAYMENT_PROVIDER');
  END IF;
  IF v_payment.provider = 'manual'
     AND (COALESCE(v_payment.metadata->>'payment_mode', '') <> 'manual_pilot'
       OR COALESCE((v_payment.metadata->>'manual_approval_pending')::boolean, false) IS NOT TRUE) THEN
    RETURN jsonb_build_object('success', false, 'payment_approved', false, 'code', 'MANUAL_PILOT_PAYMENT_REQUIRED');
  END IF;
  IF v_payment.status NOT IN ('pending', 'pending_payment') THEN
    RETURN jsonb_build_object('success', false, 'payment_approved', false, 'code', 'PAYMENT_NOT_PENDING');
  END IF;

  SELECT * INTO v_request
  FROM public.pharmacy_dispatch_requests
  WHERE id = v_payment.dispatch_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'payment_approved', false, 'code', 'REQUEST_NOT_FOUND');
  END IF;
  IF v_request.status::text IN ('expired', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'payment_approved', false,
      'code', 'DISPATCH_REQUEST_TERMINAL', 'request_status', v_request.status::text);
  END IF;
  IF v_request.status::text NOT IN ('pending_payment', 'searching') THEN
    RETURN jsonb_build_object('success', false, 'payment_approved', false,
      'code', 'DISPATCH_REQUEST_NOT_ELIGIBLE', 'request_status', v_request.status::text);
  END IF;

  SELECT * INTO v_config
  FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code = v_request.care_country;
  IF NOT FOUND OR v_payment.currency IS DISTINCT FROM v_config.currency
     OR v_payment.amount_minor IS DISTINCT FROM v_config.consultation_price_minor THEN
    RETURN jsonb_build_object('success', false, 'payment_approved', false, 'code', 'PHARMACY_PAYMENT_PRICE_MISMATCH');
  END IF;

  v_original_provider_payment_id := v_payment.provider_payment_id;
  UPDATE public.pharmacy_dispatch_payments
  SET status = 'approved',
      -- Preserve a real PSP ID; otherwise use a clearly synthetic internal marker.
      provider_payment_id = COALESCE(provider_payment_id, 'MANUAL_OVERRIDE_' || id::text),
      paid_at = COALESCE(paid_at, v_override_at),
      metadata = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(metadata, '{}'::jsonb),
                  '{manual_override_by}', to_jsonb(p_actor_id), true),
                '{manual_override_at}', to_jsonb(v_override_at), true),
              '{manual_override_reason}', to_jsonb(btrim(p_reason)), true),
            '{manual_override_evidence_reference}', to_jsonb(btrim(p_evidence_reference)), true),
          '{manual_approval_pending}', 'false'::jsonb, true),
        '{manual_override_type}', to_jsonb(CASE WHEN provider = 'mercadopago'
          THEN 'mercadopago_admin_exception' ELSE 'manual_pilot_admin_approval' END), true)
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  -- The existing approved-payment trigger owns the only dispatch activation path.
  SELECT * INTO v_request
  FROM public.pharmacy_dispatch_requests
  WHERE id = v_payment.dispatch_request_id;
  v_dispatch_result := COALESCE(
    v_request.dispatch_activation_result,
    jsonb_build_object('success', false, 'code', 'DISPATCH_RESULT_UNAVAILABLE',
      'request_status', v_request.status::text)
  );
  v_dispatch_success := COALESCE((v_dispatch_result->>'success')::boolean, false);

  INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_actor_id, 'pharmacy_payment_manual_override_approved',
    'pharmacy_dispatch_payments', v_payment.id,
    jsonb_build_object(
      'dispatch_request_id', v_payment.dispatch_request_id,
      'country_code', v_request.care_country,
      'currency', v_payment.currency,
      'amount_minor', v_payment.amount_minor,
      'provider', v_payment.provider,
      'provider_payment_id', v_payment.provider_payment_id,
      'original_provider_payment_id', v_original_provider_payment_id,
      'manual_override_type', v_payment.metadata->>'manual_override_type',
      'manual_override_at', v_payment.paid_at,
      'reason', btrim(p_reason),
      'evidence_reference', btrim(p_evidence_reference),
      'approved_by', p_actor_id,
      'dispatch_result', v_dispatch_result
    )
  );

  RETURN jsonb_build_object(
    'success', v_dispatch_success, 'payment_approved', true, 'already_approved', false,
    'code', CASE WHEN v_dispatch_success THEN 'PAYMENT_AND_DISPATCH_ACTIVATED'
      ELSE COALESCE(v_dispatch_result->>'code', 'DISPATCH_REQUIRES_ADMIN_RESOLUTION') END,
    'status', CASE WHEN v_dispatch_success THEN 'approved'
      ELSE 'approved_pending_dispatch_resolution' END,
    'payment_id', v_payment.id, 'dispatch_request_id', v_payment.dispatch_request_id,
    'provider', v_payment.provider, 'provider_payment_id', v_payment.provider_payment_id,
    'manual_override_by', p_actor_id, 'dispatch_result', v_dispatch_result
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid, uuid, text, text)
  TO service_role;
