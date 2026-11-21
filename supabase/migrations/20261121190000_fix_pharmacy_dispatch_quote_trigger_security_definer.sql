-- Fix SQLSTATE 42501 ("permission denied for table pharmacy_dispatch_pricing_configs")
-- when authenticated patients insert into public.pharmacy_dispatch_requests.
--
-- Migration 20261115110000 revoked all direct access on
-- public.pharmacy_dispatch_pricing_configs from anon/authenticated, but left
-- public.set_jordan_br_dispatch_quote() as SECURITY INVOKER. Making the trigger
-- functions SECURITY DEFINER (with locked search_path = '') preserves strict
-- table-level REVOKE ALL while allowing BEFORE INSERT triggers to quote rows.

CREATE OR REPLACE FUNCTION public.set_jordan_br_dispatch_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.set_jordan_br_dispatch_quote() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.guard_jordan_br_referral() FROM PUBLIC, anon, authenticated;
