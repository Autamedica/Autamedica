-- Dynamic doctor earning and referral commission for BR/AR dispatches.
-- Dispatch-level values override the current country pricing configuration.
BEGIN;

CREATE OR REPLACE FUNCTION app_private.record_pharmacy_dispatch_doctor_earning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_fee_minor := COALESCE(
    NULLIF(NEW.doctor_fee_minor, 0),
    CASE WHEN NEW.doctor_fee_brl > 0
      THEN round(NEW.doctor_fee_brl * 100)::integer END,
    v_config.doctor_fee_minor
  );
  v_currency := COALESCE(NULLIF(NEW.currency, ''), v_config.currency);

  IF v_fee_minor <= 0 OR v_currency <> v_config.currency THEN
    RETURN NEW;
  END IF;

  SELECT
    CASE WHEN left(COALESCE(p.provider_payment_id, ''), 16) = 'MANUAL_OVERRIDE_'
      THEN 'manual_override' ELSE 'mercadopago' END,
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
    v_fee_minor, 0, 0, v_fee_minor, v_currency, 'pending',
    jsonb_build_object(
      'source','pharmacy_dispatch',
      'dispatch_request_id',NEW.id,
      'care_country',NEW.care_country,
      'doctor_fee_minor',v_fee_minor,
      'currency',v_currency,
      'payment_provenance',v_payment_provenance,
      'manual_override_by',v_manual_by,
      'manual_override_at',v_manual_at,
      'pricing_config_country',v_config.country_code
    ), now(), now()
  )
  ON CONFLICT (dispatch_request_id) WHERE dispatch_request_id IS NOT NULL
  DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_pharmacy_referral_commission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'pg_catalog','public'
AS $function$
DECLARE
  v_partner uuid;
  v_country text;
  v_partner_active boolean;
  v_phone text;
  v_document text;
  v_commission_minor integer;
  v_currency text;
  v_consultation_minor integer;
  v_phone_match boolean;
  v_document_match boolean;
  v_prior_paid boolean := false;
BEGIN
  IF NEW.status='approved' THEN
    SELECT d.referral_partner_id,d.care_country,d.patient_phone,
           COALESCE(d.patient_cpf,d.patient_dni),p.active
    INTO v_partner,v_country,v_phone,v_document,v_partner_active
    FROM public.pharmacy_dispatch_requests d
    LEFT JOIN public.commercial_referral_partners p ON p.id=d.referral_partner_id
    WHERE d.id=NEW.dispatch_request_id;

    IF v_partner IS NULL OR v_partner_active IS DISTINCT FROM TRUE THEN
      RETURN NEW;
    END IF;

    SELECT currency,consultation_price_minor,partner_commission_minor
    INTO v_currency,v_consultation_minor,v_commission_minor
    FROM public.pharmacy_dispatch_pricing_configs
    WHERE country_code=v_country;
    IF NOT FOUND OR NEW.currency IS DISTINCT FROM v_currency
       OR NEW.amount_minor IS DISTINCT FROM v_consultation_minor
       OR NEW.paid_at IS NULL OR v_commission_minor<=0
       OR NOT (
         (NEW.provider='mercadopago' AND NEW.provider_payment_id ~ '^[0-9]{1,20}$')
         OR (left(COALESCE(NEW.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
             AND NULLIF(NEW.metadata->>'manual_override_by','') IS NOT NULL)
       ) THEN
      RETURN NEW;
    END IF;

    v_phone:=regexp_replace(COALESCE(v_phone,''),'[^0-9]','','g');
    IF v_country='BR' AND left(v_phone,2)='55' AND length(v_phone) IN (12,13) THEN
      v_phone:=substring(v_phone FROM 3);
    ELSIF v_country='AR' AND left(v_phone,2)='54' AND length(v_phone) IN (12,13) THEN
      v_phone:=substring(v_phone FROM 3);
    END IF;
    IF length(v_phone) NOT IN (10,11) THEN v_phone:=NULL; END IF;
    v_document:=regexp_replace(COALESCE(v_document,''),'[^0-9]','','g');
    IF v_document !~ '^[0-9]{5,11}$' THEN v_document:=NULL; END IF;
    IF v_phone IS NULL AND v_document IS NULL THEN RETURN NEW; END IF;

    IF v_phone IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext(v_partner::text),hashtext(v_country||':phone:'||v_phone));
    END IF;
    IF v_document IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext(v_partner::text),hashtext(v_country||':document:'||v_document));
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.pharmacy_dispatch_payments pp
      JOIN public.pharmacy_dispatch_requests pr ON pr.id=pp.dispatch_request_id
      WHERE pp.dispatch_request_id<>NEW.dispatch_request_id
        AND pp.status IN ('approved','refunded')
        AND pr.care_country=v_country
        AND pr.referral_partner_id=v_partner
        AND (
          (v_phone IS NOT NULL AND
            CASE
              WHEN v_country='BR' AND left(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g'),2)='55'
                   AND length(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g')) IN (12,13)
                THEN substring(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g') FROM 3)
              WHEN v_country='AR' AND left(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g'),2)='54'
                   AND length(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g')) IN (12,13)
                THEN substring(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g') FROM 3)
              ELSE regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g')
            END=v_phone)
          OR (v_document IS NOT NULL AND
            regexp_replace(COALESCE(pr.patient_cpf,pr.patient_dni,''),'[^0-9]','','g')=v_document)
        )
    ) INTO v_prior_paid;

    IF v_prior_paid THEN RETURN NEW; END IF;

    INSERT INTO public.commercial_referral_commissions (
      dispatch_request_id,dispatch_payment_id,referral_partner_id,
      amount_minor,currency,status,eligible_at,metadata
    ) VALUES (
      NEW.dispatch_request_id,NEW.id,v_partner,
      v_commission_minor,v_currency,'eligible',now(),
      jsonb_build_object(
        'care_country',v_country,
        'payment_provenance',CASE
          WHEN left(COALESCE(NEW.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
            THEN 'manual_counter_override' ELSE 'mercadopago' END,
        'manual_override_by',NEW.metadata->>'manual_override_by',
        'manual_override_at',NEW.metadata->>'manual_override_at'
      )
    )
    ON CONFLICT (dispatch_request_id) DO NOTHING;

  ELSIF NEW.status IN ('refunded','cancelled','rejected') THEN
    UPDATE public.commercial_referral_commissions
    SET status='reversed',reversed_at=now()
    WHERE dispatch_payment_id=NEW.id AND status IN ('eligible','paid');
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
