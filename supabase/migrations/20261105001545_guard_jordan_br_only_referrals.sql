-- Jordan is a Brazil-only commercial channel.
-- This guard prevents a non-BR dispatch from carrying Jordan attribution,
-- independently of callers (web, Android, direct PostgREST or service role).
-- It does not change the isolated Argentina consultation flow.
-- Staging may not yet contain the full app_private clinical schema.
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE OR REPLACE FUNCTION app_private.guard_jordan_br_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_partner_code text;
BEGIN
  IF NEW.referral_partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT code INTO v_partner_code
  FROM public.commercial_referral_partners
  WHERE id = NEW.referral_partner_id;

  IF v_partner_code = 'JORDAN' AND NEW.care_country IS DISTINCT FROM 'BR' THEN
    RAISE EXCEPTION 'jordan_referral_brazil_only'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_jordan_br_referral() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_jordan_br_referral ON public.pharmacy_dispatch_requests;
CREATE TRIGGER zz_jordan_br_referral
  BEFORE INSERT OR UPDATE OF referral_partner_id,care_country
  ON public.pharmacy_dispatch_requests
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_jordan_br_referral();

COMMENT ON FUNCTION app_private.guard_jordan_br_referral() IS
  'Jordan belongs solely to BR: reject any AR/unknown dispatch with Jordan commercial attribution.';
