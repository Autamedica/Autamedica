-- Fix manual approval identifier collision and make repeated approval requests safe.
-- Preserve the existing country/price checks and manual audit trail.
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
    RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_FOUND');
  END IF;

  -- A retry after a successful approval must be harmless and must not create
  -- another audit event or dispatch activation.
  IF v_payment.status = 'approved' THEN
    SELECT * INTO v_request
    FROM public.pharmacy_dispatch_requests
    WHERE id = v_payment.dispatch_request_id;
    v_dispatch_result := COALESCE(
      v_request.dispatch_activation_result,
      jsonb_build_object('success', false, 'code', 'DISPATCH_RESULT_UNAVAILABLE',
                         'request_status', v_request.status::text)
    );
    RETURN jsonb_build_object(
      'success', true,
      'payment_approved', true,
      'already_approved', true,
      'dispatch_activated', COALESCE((v_dispatch_result->>'success')::boolean, false),
      'code', CASE WHEN COALESCE((v_dispatch_result->>'success')::boolean, false)
                   THEN 'PAYMENT_AND_DISPATCH_ACTIVATED'
                   ELSE 'PAYMENT_APPROVED_DISPATCH_PENDING' END,
      'payment_id', v_payment.id,
      'dispatch_request_id', v_payment.dispatch_request_id,
      'status', v_payment.status,
      'provider_payment_id', v_payment.provider_payment_id,
      'dispatch_result', v_dispatch_result
    );
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
           ELSE 'MANUAL_OVERRIDE_' || id::text
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
    jsonb_build_object('success', false, 'code', 'DISPATCH_RESULT_UNAVAILABLE',
                       'request_status', v_request.status::text)
  );

  INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
  VALUES (
    p_actor_id, 'pharmacy_payment_manual_override_approved',
    'pharmacy_dispatch_payments', v_payment.id,
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
    -- Approval success is distinct from dispatch activation. A dispatch
    -- failure must never turn a recorded payment approval into a false failure.
    'success', true,
    'payment_approved', true,
    'dispatch_activated', COALESCE((v_dispatch_result->>'success')::boolean, false),
    'code', CASE
      WHEN COALESCE((v_dispatch_result->>'success')::boolean, false)
        THEN 'PAYMENT_AND_DISPATCH_ACTIVATED'
      ELSE 'PAYMENT_APPROVED_DISPATCH_PENDING'
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
