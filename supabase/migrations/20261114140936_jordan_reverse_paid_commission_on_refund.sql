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
    WHERE dispatch_payment_id=NEW.id AND status IN ('eligible','paid');
  END IF;
  RETURN NEW;
END;
$function$;