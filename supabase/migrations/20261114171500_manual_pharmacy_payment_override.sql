-- Exceptional administrator approval for pharmacy counter payments.
-- Normal Mercado Pago webhook confirmation remains unchanged.
ALTER TABLE public.pharmacy_dispatch_payments
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
DECLARE
  v_enabled boolean;
  v_country text;
  v_tier text;
BEGIN
  SELECT dispatch_engine_enabled INTO v_enabled
  FROM public.platform_operational_switches
  WHERE id = 'global';
  IF v_enabled IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success', false, 'code', 'DISPATCH_ENGINE_DISABLED');
  END IF;

  SELECT care_country, tier_requested::text
    INTO v_country, v_tier
  FROM public.pharmacy_dispatch_requests
  WHERE id = p_dispatch_id;

  IF v_country = 'BR' THEN
    IF v_tier IS DISTINCT FROM 'general' THEN
      RETURN jsonb_build_object('success', false, 'code', 'BRAZIL_GENERAL_CONSULTATION_ONLY');
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.pharmacy_dispatch_payments pay
      WHERE pay.dispatch_request_id = p_dispatch_id
        AND pay.status = 'approved'
        AND pay.provider = 'mercadopago'
        AND pay.paid_at IS NOT NULL
        AND pay.currency = 'BRL'
        AND pay.amount_minor = 7900
        AND (
          pay.provider_payment_id ~ '^[0-9]{1,20}$'
          OR NULLIF(pay.metadata->>'manual_override_by', '') IS NOT NULL
        )
    ) THEN
      RETURN jsonb_build_object('success', false, 'code', 'BRAZIL_PAYMENT_REQUIRED');
    END IF;
  END IF;

  RETURN app_private.match_dispatch_doctors_without_switch(p_dispatch_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_manual_approve_pharmacy_payment(
  p_payment_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
DECLARE
  v_payment public.pharmacy_dispatch_payments%ROWTYPE;
  v_dispatch_status text;
  v_dispatch_result jsonb := jsonb_build_object('success', false, 'code', 'REQUEST_NOT_SEARCHING');
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_actor_id AND role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
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

  UPDATE public.pharmacy_dispatch_payments
  SET status = 'approved',
      provider_payment_id = COALESCE(provider_payment_id, 'MANUAL_OVERRIDE_' || p_actor_id::text),
      paid_at = COALESCE(paid_at, now()),
      metadata = jsonb_set(
        jsonb_set(COALESCE(metadata, '{}'::jsonb), '{manual_override_by}', to_jsonb(p_actor_id), true),
        '{manual_override_at}', to_jsonb(now()), true
      )
  WHERE id = p_payment_id
  RETURNING * INTO v_payment;

  SELECT status::text INTO v_dispatch_status
  FROM public.pharmacy_dispatch_requests
  WHERE id = v_payment.dispatch_request_id;

  IF v_dispatch_status = 'searching' THEN
    v_dispatch_result := public.match_dispatch_doctors(v_payment.dispatch_request_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'dispatch_request_id', v_payment.dispatch_request_id,
    'status', v_payment.status,
    'provider_payment_id', v_payment.provider_payment_id,
    'manual_override_by', p_actor_id,
    'dispatch_result', v_dispatch_result
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid, uuid) TO service_role;
