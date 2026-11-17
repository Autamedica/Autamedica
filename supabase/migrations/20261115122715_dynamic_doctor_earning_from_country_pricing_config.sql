CREATE OR REPLACE FUNCTION app_private.record_pharmacy_dispatch_doctor_earning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
  v_fee_minor integer;
  v_currency text;
  v_payment_provenance text;
  v_manual_by text;
  v_manual_at text;
BEGIN
  IF NEW.status::text <> 'completed'
     OR OLD.status::text = 'completed'
     OR NEW.assigned_doctor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_config
  FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code = NEW.care_country;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The country pricing table is the sole source of truth for doctor payout.
  v_fee_minor := v_config.doctor_fee_minor;
  v_currency := v_config.currency;

  IF v_fee_minor IS NULL OR v_fee_minor <= 0 OR v_currency IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    CASE
      WHEN left(COALESCE(p.provider_payment_id, ''), 16) = 'MANUAL_OVERRIDE_'
        THEN 'manual_override'
      ELSE 'mercadopago'
    END,
    CASE WHEN left(COALESCE(p.provider_payment_id, ''), 16) = 'MANUAL_OVERRIDE_'
      THEN p.metadata->>'manual_override_by' END,
    CASE WHEN left(COALESCE(p.provider_payment_id, ''), 16) = 'MANUAL_OVERRIDE_'
      THEN p.metadata->>'manual_override_at' END
  INTO v_payment_provenance, v_manual_by, v_manual_at
  FROM public.pharmacy_dispatch_payments p
  WHERE p.dispatch_request_id = NEW.id
    AND p.status = 'approved'
    AND p.paid_at IS NOT NULL
    AND p.currency = v_config.currency
    AND p.amount_minor = v_config.consultation_price_minor
    AND (
      (p.provider = 'mercadopago' AND p.provider_payment_id ~ '^[0-9]{1,20}$')
      OR (
        p.provider = 'manual'
        AND left(COALESCE(p.provider_payment_id, ''), 16) = 'MANUAL_OVERRIDE_'
        AND NULLIF(p.metadata->>'manual_override_by', '') IS NOT NULL
        AND NULLIF(p.metadata->>'manual_override_at', '') IS NOT NULL
        AND NULLIF(p.metadata->>'manual_override_reason', '') IS NOT NULL
        AND NULLIF(p.metadata->>'manual_override_evidence_reference', '') IS NOT NULL
      )
    )
  ORDER BY p.paid_at DESC NULLS LAST, p.created_at DESC
  LIMIT 1;

  IF v_config.require_payment_before_dispatch AND v_payment_provenance IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.doctor_earnings (
    doctor_id, appointment_id, appointment_payment_id, dispatch_request_id,
    gross_amount, platform_fee_amount, processor_fee_amount, net_amount,
    currency, status, metadata, created_at, updated_at
  ) VALUES (
    NEW.assigned_doctor_id, NULL, NULL, NEW.id,
    v_fee_minor, 0, 0, v_fee_minor,
    v_currency, 'pending',
    jsonb_build_object(
      'source', 'pharmacy_dispatch',
      'dispatch_request_id', NEW.id,
      'care_country', NEW.care_country,
      'doctor_fee_minor', v_fee_minor,
      'currency', v_currency,
      'payment_provenance', v_payment_provenance,
      'manual_override_by', v_manual_by,
      'manual_override_at', v_manual_at,
      'pricing_config_country', v_config.country_code
    ),
    now(), now()
  )
  ON CONFLICT (dispatch_request_id) WHERE dispatch_request_id IS NOT NULL
  DO NOTHING;

  RETURN NEW;
END;
$function$;