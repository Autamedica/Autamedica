ALTER TABLE public.commercial_referral_commissions
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id);

ALTER TABLE public.commercial_referral_commissions
  DROP CONSTRAINT IF EXISTS commercial_referral_commissions_status_check;
ALTER TABLE public.commercial_referral_commissions
  ADD CONSTRAINT commercial_referral_commissions_status_check
  CHECK (status = ANY (ARRAY['eligible'::text, 'reversed'::text, 'paid'::text]));

-- Brazil express requests use one fixed quote, with or without commercial attribution.
CREATE OR REPLACE FUNCTION public.set_jordan_br_dispatch_quote()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE v_code text; v_active boolean;
BEGIN
  IF NEW.referral_partner_id IS NOT NULL THEN
    SELECT p.code,p.active INTO v_code,v_active FROM public.commercial_referral_partners p WHERE p.id=NEW.referral_partner_id;
    IF NOT FOUND OR v_active IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'referral_partner_inactive_or_missing' USING ERRCODE='23514'; END IF;
    IF v_code='JORDAN' AND (NEW.care_country IS DISTINCT FROM 'BR' OR NEW.tier_requested::text<>'general') THEN
      RAISE EXCEPTION 'jordan_br_general_only' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.care_country='BR' THEN
    IF NEW.tier_requested::text<>'general' THEN RAISE EXCEPTION 'brazil_pharmacy_express_general_only' USING ERRCODE='23514'; END IF;
    IF (NEW.price_brl IS NOT NULL AND NEW.price_brl<>79.00) OR (NEW.doctor_fee_brl IS NOT NULL AND NEW.doctor_fee_brl<>40.00) THEN
      RAISE EXCEPTION 'brazil_pharmacy_quote_conflict' USING ERRCODE='23514';
    END IF;
    NEW.price_brl:=79.00; NEW.doctor_fee_brl:=40.00;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','app_private','pg_temp'
AS $function$
DECLARE v_enabled boolean; v_country text; v_tier text;
BEGIN
  SELECT dispatch_engine_enabled INTO v_enabled FROM public.platform_operational_switches WHERE id='global';
  IF v_enabled IS DISTINCT FROM TRUE THEN RETURN jsonb_build_object('success',false,'code','DISPATCH_ENGINE_DISABLED'); END IF;
  SELECT care_country,tier_requested::text INTO v_country,v_tier FROM public.pharmacy_dispatch_requests WHERE id=p_dispatch_id;
  IF v_country='BR' THEN
    IF v_tier IS DISTINCT FROM 'general' THEN RETURN jsonb_build_object('success',false,'code','BRAZIL_GENERAL_CONSULTATION_ONLY'); END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.pharmacy_dispatch_payments pay
      WHERE pay.dispatch_request_id=p_dispatch_id AND pay.status='approved'
        AND pay.provider='mercadopago' AND pay.provider_payment_id ~ '^[0-9]{1,20}$'
        AND pay.paid_at IS NOT NULL AND pay.currency='BRL' AND pay.amount_minor=7900
    ) THEN RETURN jsonb_build_object('success',false,'code','BRAZIL_PAYMENT_REQUIRED'); END IF;
  END IF;
  RETURN app_private.match_dispatch_doctors_without_switch(p_dispatch_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_jordan_after_payment_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_status text; v_country text; v_tier text;
BEGIN
  IF NEW.status<>'approved' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status=NEW.status THEN RETURN NEW; END IF;
  IF NEW.provider<>'mercadopago' OR NEW.currency<>'BRL' OR NEW.amount_minor<>7900
     OR NEW.provider_payment_id IS NULL OR NEW.provider_payment_id !~ '^[0-9]{1,20}$' OR NEW.paid_at IS NULL THEN RETURN NEW; END IF;
  SELECT r.status,r.care_country,r.tier_requested::text INTO v_status,v_country,v_tier
  FROM public.pharmacy_dispatch_requests r WHERE r.id=NEW.dispatch_request_id;
  IF v_status='searching' AND v_country='BR' AND v_tier='general' THEN PERFORM public.match_dispatch_doctors(NEW.dispatch_request_id); END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.record_pharmacy_dispatch_doctor_earning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_fee_minor integer;
BEGIN
  IF NEW.status::text<>'completed' OR OLD.status::text='completed' OR NEW.assigned_doctor_id IS NULL
     OR NEW.doctor_fee_brl IS NULL OR NEW.doctor_fee_brl<=0 THEN RETURN NEW; END IF;
  IF NEW.care_country='BR' AND NOT EXISTS (
    SELECT 1 FROM public.pharmacy_dispatch_payments p
    WHERE p.dispatch_request_id=NEW.id AND p.status='approved' AND p.provider='mercadopago'
      AND p.provider_payment_id ~ '^[0-9]{1,20}$' AND p.paid_at IS NOT NULL
      AND p.currency='BRL' AND p.amount_minor=7900
  ) THEN RETURN NEW; END IF;
  v_fee_minor:=round(NEW.doctor_fee_brl*100)::integer;
  IF v_fee_minor<=0 THEN RETURN NEW; END IF;
  INSERT INTO public.doctor_earnings (
    doctor_id,appointment_id,appointment_payment_id,dispatch_request_id,gross_amount,
    platform_fee_amount,processor_fee_amount,net_amount,currency,status,metadata,created_at,updated_at
  ) VALUES (
    NEW.assigned_doctor_id,NULL,NULL,NEW.id,v_fee_minor,0,0,v_fee_minor,'BRL','pending',
    jsonb_build_object('source','pharmacy_dispatch','dispatch_request_id',NEW.id,'doctor_fee_brl',NEW.doctor_fee_brl),now(),now()
  ) ON CONFLICT (dispatch_request_id) WHERE dispatch_request_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_pharmacy_referral_commission()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_partner uuid; v_country text; v_partner_code text; v_partner_active boolean;
        v_phone text; v_cpf text; v_prior_paid boolean := false;
BEGIN
  IF NEW.status='approved' THEN
    SELECT d.referral_partner_id,d.care_country,d.patient_phone,COALESCE(d.patient_cpf,d.patient_dni),p.code,p.active
      INTO v_partner,v_country,v_phone,v_cpf,v_partner_code,v_partner_active
    FROM public.pharmacy_dispatch_requests d LEFT JOIN public.commercial_referral_partners p ON p.id=d.referral_partner_id
    WHERE d.id=NEW.dispatch_request_id;
    IF v_partner IS NULL OR v_country IS DISTINCT FROM 'BR' OR v_partner_code IS DISTINCT FROM 'JORDAN' OR v_partner_active IS DISTINCT FROM TRUE THEN RETURN NEW; END IF;
    IF NEW.provider IS DISTINCT FROM 'mercadopago' OR NEW.amount_minor IS DISTINCT FROM 7900 OR NEW.currency IS DISTINCT FROM 'BRL'
       OR NEW.provider_payment_id IS NULL OR NEW.provider_payment_id !~ '^[0-9]{1,20}$' OR NEW.paid_at IS NULL THEN RETURN NEW; END IF;
    v_phone:=regexp_replace(COALESCE(v_phone,''),'[^0-9]','','g');
    IF left(v_phone,2)='55' AND length(v_phone) IN (12,13) THEN v_phone:=substring(v_phone FROM 3); END IF;
    IF length(v_phone) NOT IN (10,11) THEN v_phone:=NULL; END IF;
    v_cpf:=regexp_replace(COALESCE(v_cpf,''),'[^0-9]','','g');
    IF length(v_cpf)<>11 THEN v_cpf:=NULL; END IF;
    IF v_phone IS NULL AND v_cpf IS NULL THEN RETURN NEW; END IF;
    IF v_phone IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(v_partner::text),hashtext('phone:'||v_phone)); END IF;
    IF v_cpf IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext(v_partner::text),hashtext('cpf:'||v_cpf)); END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.pharmacy_dispatch_payments pp
      JOIN public.pharmacy_dispatch_requests pr ON pr.id=pp.dispatch_request_id
      WHERE pp.dispatch_request_id<>NEW.dispatch_request_id AND pp.status IN ('approved','refunded')
        AND pr.care_country='BR'
        AND (
          (v_phone IS NOT NULL AND
            CASE WHEN left(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g'),2)='55'
                       AND length(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g')) IN (12,13)
                 THEN substring(regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g') FROM 3)
                 ELSE regexp_replace(COALESCE(pr.patient_phone,''),'[^0-9]','','g') END=v_phone)
          OR (v_cpf IS NOT NULL AND regexp_replace(COALESCE(pr.patient_cpf,pr.patient_dni,''),'[^0-9]','','g')=v_cpf)
        )
    ) INTO v_prior_paid;
    IF v_prior_paid THEN RETURN NEW; END IF;
    INSERT INTO public.commercial_referral_commissions (
      dispatch_request_id,dispatch_payment_id,referral_partner_id,amount_minor,currency,status,eligible_at
    ) VALUES (NEW.dispatch_request_id,NEW.id,v_partner,1000,'BRL','eligible',now())
    ON CONFLICT (dispatch_request_id) DO NOTHING;
  ELSIF NEW.status IN ('refunded','cancelled','rejected') THEN
    UPDATE public.commercial_referral_commissions SET status='reversed',reversed_at=now()
    WHERE dispatch_payment_id=NEW.id AND status='eligible';
  END IF;
  RETURN NEW;
END;
$function$;
