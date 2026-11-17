
-- Country-scoped operating tariffs for Pharmacy Express and referral dispatch.
CREATE TABLE IF NOT EXISTS public.pharmacy_dispatch_pricing_configs (
  country_code text PRIMARY KEY CHECK (country_code IN ('BR','AR')),
  currency text NOT NULL CHECK (currency IN ('BRL','ARS')),
  consultation_price_minor integer NOT NULL CHECK (consultation_price_minor > 0),
  doctor_fee_minor integer NOT NULL CHECK (doctor_fee_minor > 0),
  partner_commission_minor integer NOT NULL CHECK (partner_commission_minor >= 0),
  require_payment_before_dispatch boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  change_reason text NOT NULL
);

ALTER TABLE public.pharmacy_dispatch_pricing_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pharmacy_dispatch_pricing_configs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pharmacy_dispatch_pricing_configs TO service_role;

INSERT INTO public.pharmacy_dispatch_pricing_configs (
  country_code,currency,consultation_price_minor,doctor_fee_minor,
  partner_commission_minor,require_payment_before_dispatch,change_reason
) VALUES
  ('BR','BRL',7900,4000,1000,true,'Tarifa inicial Brasil: R$ 79 consulta, R$ 40 médico, R$ 10 canal'),
  ('AR','ARS',1500000,800000,200000,true,'Tarifa inicial Argentina: ARS 15.000 consulta, ARS 8.000 médico, ARS 2.000 canal')
ON CONFLICT (country_code) DO NOTHING;

ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS price_minor integer,
  ADD COLUMN IF NOT EXISTS doctor_fee_minor integer,
  ADD COLUMN IF NOT EXISTS currency text;

ALTER TABLE public.dispatch_offers
  ADD COLUMN IF NOT EXISTS price_minor integer,
  ADD COLUMN IF NOT EXISTS currency text;

ALTER TABLE public.pharmacy_dispatch_payments
  DROP CONSTRAINT IF EXISTS pharmacy_dispatch_payments_currency_check;
ALTER TABLE public.pharmacy_dispatch_payments
  ADD CONSTRAINT pharmacy_dispatch_payments_currency_check
  CHECK (currency IN ('BRL','ARS'));

ALTER TABLE public.commercial_referral_commissions
  DROP CONSTRAINT IF EXISTS commercial_referral_commissions_amount_minor_check;
ALTER TABLE public.commercial_referral_commissions
  ADD CONSTRAINT commercial_referral_commissions_amount_minor_check
  CHECK (amount_minor > 0);
ALTER TABLE public.commercial_referral_commissions
  DROP CONSTRAINT IF EXISTS commercial_referral_commissions_currency_check;
ALTER TABLE public.commercial_referral_commissions
  ADD CONSTRAINT commercial_referral_commissions_currency_check
  CHECK (currency IN ('BRL','ARS'));

-- The server-side admin endpoint calls this RPC. Update and audit are atomic.
CREATE OR REPLACE FUNCTION public.admin_upsert_pharmacy_dispatch_pricing_config(
  p_country_code text,
  p_currency text,
  p_consultation_price_minor integer,
  p_doctor_fee_minor integer,
  p_partner_commission_minor integer,
  p_require_payment_before_dispatch boolean,
  p_actor_id uuid,
  p_change_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_row public.pharmacy_dispatch_pricing_configs%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_actor_id AND active IS TRUE
      AND role IN ('admin','platform_admin','organization_admin')
  ) THEN
    RAISE EXCEPTION 'active_admin_required' USING ERRCODE='42501';
  END IF;
  IF p_country_code NOT IN ('BR','AR')
     OR (p_country_code='BR' AND p_currency IS DISTINCT FROM 'BRL')
     OR (p_country_code='AR' AND p_currency IS DISTINCT FROM 'ARS')
     OR p_consultation_price_minor IS NULL OR p_consultation_price_minor <= 0
     OR p_consultation_price_minor > 100000000
     OR p_doctor_fee_minor IS NULL OR p_doctor_fee_minor <= 0
     OR p_doctor_fee_minor > p_consultation_price_minor
     OR p_partner_commission_minor IS NULL OR p_partner_commission_minor < 0
     OR p_partner_commission_minor > p_consultation_price_minor
     OR p_doctor_fee_minor + p_partner_commission_minor > p_consultation_price_minor
     OR p_require_payment_before_dispatch IS NULL
     OR p_change_reason IS NULL OR length(btrim(p_change_reason)) < 8
     OR length(p_change_reason) > 500 THEN
    RAISE EXCEPTION 'invalid_pharmacy_dispatch_pricing_config' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.pharmacy_dispatch_pricing_configs (
    country_code,currency,consultation_price_minor,doctor_fee_minor,
    partner_commission_minor,require_payment_before_dispatch,
    updated_by,updated_at,change_reason
  ) VALUES (
    p_country_code,p_currency,p_consultation_price_minor,p_doctor_fee_minor,
    p_partner_commission_minor,p_require_payment_before_dispatch,
    p_actor_id,now(),btrim(p_change_reason)
  )
  ON CONFLICT (country_code) DO UPDATE SET
    currency=EXCLUDED.currency,
    consultation_price_minor=EXCLUDED.consultation_price_minor,
    doctor_fee_minor=EXCLUDED.doctor_fee_minor,
    partner_commission_minor=EXCLUDED.partner_commission_minor,
    require_payment_before_dispatch=EXCLUDED.require_payment_before_dispatch,
    updated_by=EXCLUDED.updated_by,
    updated_at=EXCLUDED.updated_at,
    change_reason=EXCLUDED.change_reason
  RETURNING * INTO v_row;

  INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
  VALUES (
    p_actor_id,'pharmacy_dispatch_pricing_updated',
    'pharmacy_dispatch_pricing_configs',NULL,
    jsonb_build_object(
      'country_code',v_row.country_code,
      'currency',v_row.currency,
      'consultation_price_minor',v_row.consultation_price_minor,
      'doctor_fee_minor',v_row.doctor_fee_minor,
      'partner_commission_minor',v_row.partner_commission_minor,
      'require_payment_before_dispatch',v_row.require_payment_before_dispatch,
      'change_reason',v_row.change_reason
    )
  );
  RETURN to_jsonb(v_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_upsert_pharmacy_dispatch_pricing_config(text,text,integer,integer,integer,boolean,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_pharmacy_dispatch_pricing_config(text,text,integer,integer,integer,boolean,uuid,text) TO service_role;

-- Keep the historic trigger name so existing installations are upgraded in place.
CREATE OR REPLACE FUNCTION public.set_jordan_br_dispatch_quote()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_code text;
  v_active boolean;
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
BEGIN
  IF NEW.care_country NOT IN ('BR','AR') THEN
    RAISE EXCEPTION 'pharmacy_dispatch_country_required' USING ERRCODE='23514';
  END IF;

  SELECT * INTO v_config
  FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code=NEW.care_country;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pharmacy_dispatch_pricing_not_configured' USING ERRCODE='23514';
  END IF;

  IF NEW.referral_partner_id IS NOT NULL THEN
    SELECT p.code,p.active INTO v_code,v_active
    FROM public.commercial_referral_partners p
    WHERE p.id=NEW.referral_partner_id;
    IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'referral_partner_inactive_or_missing' USING ERRCODE='23514';
    END IF;
    IF v_code='JORDAN' AND NEW.tier_requested::text<>'general' THEN
      RAISE EXCEPTION 'jordan_general_consultation_only' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.price_minor IS NOT NULL AND NEW.price_minor<>v_config.consultation_price_minor THEN
    RAISE EXCEPTION 'pharmacy_consultation_quote_conflict' USING ERRCODE='23514';
  END IF;
  IF NEW.doctor_fee_minor IS NOT NULL AND NEW.doctor_fee_minor<>v_config.doctor_fee_minor THEN
    RAISE EXCEPTION 'pharmacy_doctor_fee_quote_conflict' USING ERRCODE='23514';
  END IF;

  NEW.currency:=v_config.currency;
  NEW.price_minor:=v_config.consultation_price_minor;
  NEW.doctor_fee_minor:=v_config.doctor_fee_minor;
  NEW.price_brl:=CASE WHEN NEW.care_country='BR' THEN v_config.consultation_price_minor::numeric/100 ELSE NULL END;
  NEW.doctor_fee_brl:=CASE WHEN NEW.care_country='BR' THEN v_config.doctor_fee_minor::numeric/100 ELSE NULL END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_jordan_br_referral()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE v_partner_code text; v_active boolean;
BEGIN
  IF NEW.referral_partner_id IS NULL THEN RETURN NEW; END IF;
  SELECT code,active INTO v_partner_code,v_active
  FROM public.commercial_referral_partners
  WHERE id=NEW.referral_partner_id;
  IF v_partner_code IS NULL OR v_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'referral_partner_inactive_or_missing' USING ERRCODE='23514';
  END IF;
  IF v_partner_code='JORDAN' AND (NEW.care_country NOT IN ('AR','BR') OR NEW.tier_requested::text<>'general') THEN
    RAISE EXCEPTION 'jordan_general_consultation_only' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public','app_private','pg_temp'
AS $function$
DECLARE
  v_enabled boolean;
  v_country text;
  v_tier text;
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
BEGIN
  SELECT dispatch_engine_enabled INTO v_enabled
  FROM public.platform_operational_switches WHERE id='global';
  IF v_enabled IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success',false,'code','DISPATCH_ENGINE_DISABLED');
  END IF;

  SELECT r.care_country,r.tier_requested::text INTO v_country,v_tier
  FROM public.pharmacy_dispatch_requests r WHERE r.id=p_dispatch_id;
  SELECT * INTO v_config FROM public.pharmacy_dispatch_pricing_configs WHERE country_code=v_country;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'code','COUNTRY_PRICING_NOT_CONFIGURED');
  END IF;
  IF v_tier IS DISTINCT FROM 'general' THEN
    RETURN jsonb_build_object('success',false,'code','PHARMACY_GENERAL_CONSULTATION_ONLY');
  END IF;

  IF v_config.require_payment_before_dispatch AND NOT EXISTS (
    SELECT 1 FROM public.pharmacy_dispatch_payments pay
    WHERE pay.dispatch_request_id=p_dispatch_id
      AND pay.status='approved' AND pay.paid_at IS NOT NULL
      AND pay.currency=v_config.currency
      AND pay.amount_minor=v_config.consultation_price_minor
      AND (
        (pay.provider='mercadopago' AND pay.provider_payment_id ~ '^[0-9]{1,20}$')
        OR (left(COALESCE(pay.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
            AND NULLIF(pay.metadata->>'manual_override_by','') IS NOT NULL)
      )
  ) THEN
    RETURN jsonb_build_object('success',false,'code','COUNTRY_PAYMENT_REQUIRED');
  END IF;

  RETURN app_private.match_dispatch_doctors_without_switch(p_dispatch_id);
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.match_dispatch_doctors_without_switch(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public','pg_temp'
AS $function$
DECLARE
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
  v_doctor_id uuid;
  v_offer_id uuid;
  v_partner_code text;
  v_partner_active boolean;
BEGIN
  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id=p_dispatch_id AND status='searching'
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'code','NOT_SEARCHING');
  END IF;

  IF v_req.care_country IS NULL OR (
    v_req.patient_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id=v_req.patient_id AND p.active IS TRUE
        AND p.care_country=v_req.care_country
    )
  ) THEN
    RETURN jsonb_build_object('success',false,'code','CARE_COUNTRY_REQUIRED');
  END IF;

  SELECT * INTO v_config FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code=v_req.care_country;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'code','COUNTRY_PRICING_NOT_CONFIGURED');
  END IF;
  IF v_req.currency IS DISTINCT FROM v_config.currency
     OR v_req.price_minor IS DISTINCT FROM v_config.consultation_price_minor
     OR v_req.doctor_fee_minor IS DISTINCT FROM v_config.doctor_fee_minor THEN
    RETURN jsonb_build_object('success',false,'code','PHARMACY_QUOTE_MISMATCH');
  END IF;
  IF v_req.tier_requested::text<>'general' THEN
    RETURN jsonb_build_object('success',false,'code','PHARMACY_GENERAL_CONSULTATION_ONLY');
  END IF;

  IF v_req.referral_partner_id IS NOT NULL THEN
    SELECT p.code,p.active INTO v_partner_code,v_partner_active
    FROM public.commercial_referral_partners p
    WHERE p.id=v_req.referral_partner_id;
    IF NOT FOUND OR v_partner_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'referral_partner_inactive_or_missing' USING ERRCODE='23514';
    END IF;
    IF v_partner_code='JORDAN' AND v_req.tier_requested::text<>'general' THEN
      RAISE EXCEPTION 'jordan_general_consultation_only' USING ERRCODE='23514';
    END IF;
  END IF;

  IF v_config.require_payment_before_dispatch AND NOT EXISTS (
    SELECT 1 FROM public.pharmacy_dispatch_payments pay
    WHERE pay.dispatch_request_id=v_req.id AND pay.status='approved'
      AND pay.paid_at IS NOT NULL
      AND pay.currency=v_config.currency
      AND pay.amount_minor=v_config.consultation_price_minor
      AND (
        (pay.provider='mercadopago' AND pay.provider_payment_id ~ '^[0-9]{1,20}$')
        OR (left(COALESCE(pay.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
            AND NULLIF(pay.metadata->>'manual_override_by','') IS NOT NULL)
      )
  ) THEN
    RETURN jsonb_build_object('success',false,'code','COUNTRY_PAYMENT_REQUIRED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers e
    WHERE e.dispatch_request_id=p_dispatch_id
      AND e.status='pending' AND e.expires_at>now()
  ) THEN
    RETURN jsonb_build_object('success',true,'code','OFFER_ALREADY_PENDING');
  END IF;

  SELECT d.id INTO v_doctor_id
  FROM public.doctors d
  JOIN public.doctor_duty_status dds ON dds.doctor_id=d.id
  WHERE d.active IS TRUE
    AND d.care_country=v_req.care_country
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND NULLIF(btrim(d.license_number),'') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND dds.is_on_duty=true
    AND (
      dds.last_heartbeat_at>now()-interval '90 seconds'
      OR EXISTS (
        SELECT 1 FROM public.profiles fcm
        WHERE fcm.user_id=d.user_id AND NULLIF(btrim(fcm.fcm_token),'') IS NOT NULL
      )
    )
    AND dds.current_active_request_id IS NULL
    AND (
      dds.active_tiers IS NULL OR cardinality(dds.active_tiers)=0
      OR v_req.tier_requested=ANY(dds.active_tiers)
      OR 'general'=ANY(dds.active_tiers)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers pending
      WHERE pending.doctor_id=d.id AND pending.status='pending'
        AND pending.expires_at>now()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers doe
      WHERE doe.dispatch_request_id=p_dispatch_id AND doe.doctor_id=d.id
        AND (
          doe.status='accepted'
          OR (doe.status='pending' AND doe.expires_at>now())
          OR doe.offered_at>now()-interval '5 minutes'
        )
    )
  ORDER BY dds.duty_started_at ASC
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RETURN jsonb_build_object('success',true,'queued',true,'code','WAITING_FOR_COUNTRY_DOCTOR');
  END IF;

  INSERT INTO public.dispatch_offers (
    dispatch_request_id,doctor_id,offered_at,expires_at,status,
    price_brl,price_minor,currency
  ) VALUES (
    p_dispatch_id,v_doctor_id,now(),now()+interval '30 seconds','pending',
    CASE WHEN v_req.care_country='BR' THEN v_req.doctor_fee_minor::numeric/100 ELSE NULL END,
    v_req.doctor_fee_minor,v_req.currency
  )
  ON CONFLICT (dispatch_request_id,doctor_id) DO UPDATE SET
    offered_at=now(),expires_at=now()+interval '30 seconds',status='pending',
    accepted_at=NULL,price_brl=EXCLUDED.price_brl,
    price_minor=EXCLUDED.price_minor,currency=EXCLUDED.currency
  RETURNING id INTO v_offer_id;

  BEGIN
    PERFORM app_private.send_authenticated_dispatch_push(
      (SELECT user_id FROM public.doctors WHERE id=v_doctor_id),
      'Nueva consulta disponible',
      'Abrí AutaMedica para revisar y aceptar la oferta.',
      jsonb_build_object(
        'type','pharmacy_dispatch_incoming',
        'request_id',p_dispatch_id::text,
        'offer_id',v_offer_id::text,
        'care_country',v_req.care_country,
        'tier',v_req.tier_requested::text,
        'time_to_live','30'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'clinical_dispatch_push_deferred: %',SQLSTATE;
  END;

  RETURN jsonb_build_object('success',true,'code','OFFER_SENT','offer_id',v_offer_id,'doctor_id',v_doctor_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_jordan_after_payment_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public','pg_temp'
AS $function$
DECLARE
  v_status text;
  v_country text;
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
BEGIN
  IF NEW.status<>'approved' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status=NEW.status THEN RETURN NEW; END IF;
  IF NEW.paid_at IS NULL OR NOT (
    (NEW.provider='mercadopago' AND NEW.provider_payment_id ~ '^[0-9]{1,20}$')
    OR (left(COALESCE(NEW.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
        AND NULLIF(NEW.metadata->>'manual_override_by','') IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT r.status,r.care_country INTO v_status,v_country
  FROM public.pharmacy_dispatch_requests r WHERE r.id=NEW.dispatch_request_id;
  SELECT * INTO v_config FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code=v_country;
  IF v_status='searching' AND v_config.country_code IS NOT NULL
     AND NEW.currency=v_config.currency
     AND NEW.amount_minor=v_config.consultation_price_minor THEN
    PERFORM public.match_dispatch_doctors(NEW.dispatch_request_id);
  END IF;
  RETURN NEW;
END;
$function$;

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
  IF NEW.status::text<>'completed' OR OLD.status::text='completed'
     OR NEW.assigned_doctor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_config FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code=NEW.care_country;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_fee_minor:=COALESCE(NEW.doctor_fee_minor,round(COALESCE(NEW.doctor_fee_brl,0)*100)::integer);
  v_currency:=COALESCE(NEW.currency,v_config.currency);
  IF v_fee_minor<=0 OR v_fee_minor<>v_config.doctor_fee_minor
     OR v_currency<>v_config.currency THEN
    RETURN NEW;
  END IF;

  SELECT
    CASE WHEN NULLIF(p.metadata->>'manual_override_by','') IS NOT NULL
      THEN 'manual_counter_override' ELSE 'mercadopago' END,
    p.metadata->>'manual_override_by',
    p.metadata->>'manual_override_at'
  INTO v_payment_provenance,v_manual_by,v_manual_at
  FROM public.pharmacy_dispatch_payments p
  WHERE p.dispatch_request_id=NEW.id AND p.status='approved'
    AND p.paid_at IS NOT NULL AND p.currency=v_config.currency
    AND p.amount_minor=v_config.consultation_price_minor
    AND (
      (p.provider='mercadopago' AND p.provider_payment_id ~ '^[0-9]{1,20}$')
      OR (left(COALESCE(p.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
          AND NULLIF(p.metadata->>'manual_override_by','') IS NOT NULL)
    )
  ORDER BY p.paid_at DESC NULLS LAST,p.created_at DESC LIMIT 1;

  IF v_config.require_payment_before_dispatch AND v_payment_provenance IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.doctor_earnings (
    doctor_id,appointment_id,appointment_payment_id,dispatch_request_id,
    gross_amount,platform_fee_amount,processor_fee_amount,net_amount,
    currency,status,metadata,created_at,updated_at
  ) VALUES (
    NEW.assigned_doctor_id,NULL,NULL,NEW.id,v_fee_minor,0,0,v_fee_minor,
    v_config.currency,'pending',
    jsonb_build_object(
      'source','pharmacy_dispatch',
      'dispatch_request_id',NEW.id,
      'care_country',NEW.care_country,
      'doctor_fee_minor',v_fee_minor,
      'currency',v_config.currency,
      'payment_provenance',v_payment_provenance,
      'manual_override_by',v_manual_by,
      'manual_override_at',v_manual_at
    ),now(),now()
  )
  ON CONFLICT (dispatch_request_id) WHERE dispatch_request_id IS NOT NULL DO NOTHING;
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

CREATE OR REPLACE FUNCTION public.admin_manual_approve_pharmacy_payment(
  p_payment_id uuid,p_actor_id uuid,p_reason text,p_evidence_reference text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog','public','app_private'
AS $function$
DECLARE
  v_payment public.pharmacy_dispatch_payments%ROWTYPE;
  v_dispatch_status text;
  v_country text;
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
  v_dispatch_result jsonb:=jsonb_build_object('success',false,'code','REQUEST_NOT_SEARCHING');
  v_original_provider_payment_id text;
  v_override_at timestamptz:=now();
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id=p_actor_id AND active IS TRUE
      AND role IN ('admin','platform_admin','organization_admin')
  ) THEN RAISE EXCEPTION 'active_admin_required' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<10 OR length(p_reason)>2000
     OR p_evidence_reference IS NULL OR length(btrim(p_evidence_reference))<4
     OR length(p_evidence_reference)>300 THEN
    RAISE EXCEPTION 'manual_override_reason_and_evidence_required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_payment FROM public.pharmacy_dispatch_payments
  WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','PAYMENT_NOT_FOUND'); END IF;
  IF v_payment.status NOT IN ('pending','pending_payment') THEN
    RETURN jsonb_build_object('success',false,'code','PAYMENT_NOT_PENDING');
  END IF;

  SELECT r.status,r.care_country INTO v_dispatch_status,v_country
  FROM public.pharmacy_dispatch_requests r WHERE r.id=v_payment.dispatch_request_id;
  SELECT * INTO v_config FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code=v_country;
  IF NOT FOUND OR v_payment.currency IS DISTINCT FROM v_config.currency
     OR v_payment.amount_minor IS DISTINCT FROM v_config.consultation_price_minor THEN
    RETURN jsonb_build_object('success',false,'code','PHARMACY_PAYMENT_PRICE_MISMATCH');
  END IF;

  v_original_provider_payment_id:=v_payment.provider_payment_id;
  UPDATE public.pharmacy_dispatch_payments
  SET status='approved',
      provider_payment_id=CASE
        WHEN provider='mercadopago' AND provider_payment_id ~ '^[0-9]{1,20}$' THEN provider_payment_id
        ELSE 'MANUAL_OVERRIDE_'||p_actor_id::text END,
      paid_at=COALESCE(paid_at,v_override_at),
      metadata=jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(COALESCE(metadata,'{}'::jsonb),
              '{manual_override_by}',to_jsonb(p_actor_id),true),
            '{manual_override_at}',to_jsonb(v_override_at),true),
          '{manual_override_reason}',to_jsonb(btrim(p_reason)),true),
        '{manual_override_evidence_reference}',to_jsonb(btrim(p_evidence_reference)),true)
  WHERE id=p_payment_id RETURNING * INTO v_payment;

  INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
  VALUES (p_actor_id,'pharmacy_payment_manual_override_approved',
    'pharmacy_dispatch_payments',v_payment.id,
    jsonb_build_object(
      'dispatch_request_id',v_payment.dispatch_request_id,
      'country_code',v_country,
      'currency',v_payment.currency,
      'amount_minor',v_payment.amount_minor,
      'provider_payment_id',v_payment.provider_payment_id,
      'original_provider_payment_id',v_original_provider_payment_id,
      'manual_override_at',v_payment.paid_at,
      'reason',btrim(p_reason),
      'evidence_reference',btrim(p_evidence_reference),
      'approved_by',p_actor_id
    ));

  IF v_dispatch_status='searching' THEN
    v_dispatch_result:=public.match_dispatch_doctors(v_payment.dispatch_request_id);
  END IF;
  RETURN jsonb_build_object(
    'success',true,'payment_id',v_payment.id,
    'dispatch_request_id',v_payment.dispatch_request_id,'status',v_payment.status,
    'provider_payment_id',v_payment.provider_payment_id,
    'manual_override_by',p_actor_id,'dispatch_result',v_dispatch_result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_match_dispatch_doctors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public','pg_temp'
AS $function$
BEGIN
  IF NEW.status='searching' THEN
    -- The country-specific matcher enforces the active tariff and payment-first rule.
    PERFORM public.match_dispatch_doctors(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;
