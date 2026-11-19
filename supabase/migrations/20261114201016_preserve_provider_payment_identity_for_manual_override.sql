CREATE OR REPLACE FUNCTION public.admin_manual_approve_pharmacy_payment(
  p_payment_id uuid,
  p_actor_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
DECLARE
  v_payment public.pharmacy_dispatch_payments%ROWTYPE;
  v_dispatch_status text;
  v_dispatch_result jsonb := jsonb_build_object('success', false, 'code', 'REQUEST_NOT_SEARCHING');
  v_original_provider_payment_id text;
  v_override_at timestamptz := now();
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_actor_id AND role::text = 'admin'
  ) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_payment FROM public.pharmacy_dispatch_payments
  WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_FOUND'); END IF;
  IF v_payment.status NOT IN ('pending', 'pending_payment') THEN
    RETURN jsonb_build_object('success', false, 'code', 'PAYMENT_NOT_PENDING');
  END IF;
  v_original_provider_payment_id := v_payment.provider_payment_id;
  UPDATE public.pharmacy_dispatch_payments
  SET status = 'approved',
      provider_payment_id = COALESCE(provider_payment_id, 'MANUAL_OVERRIDE_' || p_actor_id::text),
      paid_at = COALESCE(paid_at, v_override_at),
      metadata = jsonb_set(
        jsonb_set(
          jsonb_set(COALESCE(metadata, '{}'::jsonb),
            '{manual_override_by}', to_jsonb(p_actor_id), true),
          '{manual_override_at}', to_jsonb(v_override_at), true),
        '{manual_override_original_provider_payment_id}',
        COALESCE(to_jsonb(v_original_provider_payment_id), 'null'::jsonb), true)
  WHERE id = p_payment_id RETURNING * INTO v_payment;
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, metadata)
  VALUES (p_actor_id, 'pharmacy_payment_manual_override_approved',
    'pharmacy_dispatch_payments', v_payment.id::text,
    jsonb_build_object(
      'dispatch_request_id', v_payment.dispatch_request_id,
      'provider_payment_id', v_payment.provider_payment_id,
      'original_provider_payment_id', v_original_provider_payment_id,
      'manual_override_at', v_payment.paid_at
    ));
  SELECT status::text INTO v_dispatch_status FROM public.pharmacy_dispatch_requests
  WHERE id = v_payment.dispatch_request_id;
  IF v_dispatch_status = 'searching' THEN
    v_dispatch_result := public.match_dispatch_doctors(v_payment.dispatch_request_id);
  END IF;
  RETURN jsonb_build_object(
    'success', true, 'payment_id', v_payment.id,
    'dispatch_request_id', v_payment.dispatch_request_id, 'status', v_payment.status,
    'provider_payment_id', v_payment.provider_payment_id, 'manual_override_by', p_actor_id,
    'dispatch_result', v_dispatch_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.record_pharmacy_dispatch_doctor_earning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_fee_minor integer;
BEGIN
  IF NEW.status::text <> 'completed' OR OLD.status::text = 'completed'
     OR NEW.assigned_doctor_id IS NULL OR NEW.doctor_fee_brl IS NULL OR NEW.doctor_fee_brl <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.care_country = 'BR' AND NOT EXISTS (
    SELECT 1 FROM public.pharmacy_dispatch_payments p
    WHERE p.dispatch_request_id = NEW.id AND p.status = 'approved'
      AND p.paid_at IS NOT NULL AND p.currency = 'BRL' AND p.amount_minor = 7900
      AND (
        (p.provider = 'mercadopago' AND p.provider_payment_id ~ '^[0-9]{1,20}$')
        OR (p.provider_payment_id LIKE 'MANUAL\_OVERRIDE\_%' ESCAPE '\'
            AND NULLIF(p.metadata->>'manual_override_by', '') IS NOT NULL)
      )
  ) THEN RETURN NEW; END IF;
  v_fee_minor := round(NEW.doctor_fee_brl * 100)::integer;
  IF v_fee_minor <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.doctor_earnings (
    doctor_id, appointment_id, appointment_payment_id, dispatch_request_id,
    gross_amount, platform_fee_amount, processor_fee_amount, net_amount,
    currency, status, metadata, created_at, updated_at
  ) VALUES (
    NEW.assigned_doctor_id, NULL, NULL, NEW.id, v_fee_minor, 0, 0, v_fee_minor,
    'BRL', 'pending',
    jsonb_build_object(
      'source', 'pharmacy_dispatch',
      'dispatch_request_id', NEW.id,
      'doctor_fee_brl', NEW.doctor_fee_brl,
      'payment_provenance', (
        SELECT CASE
          WHEN NULLIF(p.metadata->>'manual_override_by', '') IS NOT NULL
            THEN 'manual_counter_override'
          ELSE 'mercadopago'
        END
        FROM public.pharmacy_dispatch_payments p
        WHERE p.dispatch_request_id = NEW.id AND p.status = 'approved'
          AND p.paid_at IS NOT NULL AND p.currency = 'BRL' AND p.amount_minor = 7900
        ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC LIMIT 1
      ),
      'manual_override_by', (
        SELECT p.metadata->>'manual_override_by'
        FROM public.pharmacy_dispatch_payments p
        WHERE p.dispatch_request_id = NEW.id AND p.status = 'approved'
          AND NULLIF(p.metadata->>'manual_override_by', '') IS NOT NULL
          AND p.paid_at IS NOT NULL
        ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC LIMIT 1
      ),
      'manual_override_at', (
        SELECT p.metadata->>'manual_override_at'
        FROM public.pharmacy_dispatch_payments p
        WHERE p.dispatch_request_id = NEW.id AND p.status = 'approved'
          AND NULLIF(p.metadata->>'manual_override_by', '') IS NOT NULL
          AND p.paid_at IS NOT NULL
        ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC LIMIT 1
      )
    ), now(), now()
  ) ON CONFLICT (dispatch_request_id) WHERE dispatch_request_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid, uuid) TO service_role;
