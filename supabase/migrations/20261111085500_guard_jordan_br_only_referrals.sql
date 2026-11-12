-- Reconcile the production Supabase migration entry created through the
-- controlled database migration operation on 2026-11-11.
-- The original source migration 20261105001545_guard_jordan_br_only_referrals.sql
-- remains the canonical introduction of this guard. This duplicate is
-- intentionally idempotent and keeps the generated remote version
-- 20261111085500 present in the repository migration history.
BEGIN;
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

REVOKE ALL ON FUNCTION app_private.guard_jordan_br_referral()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_jordan_br_referral
  ON public.pharmacy_dispatch_requests;
CREATE TRIGGER zz_jordan_br_referral
  BEFORE INSERT OR UPDATE OF referral_partner_id,care_country
  ON public.pharmacy_dispatch_requests
  FOR EACH ROW EXECUTE FUNCTION app_private.guard_jordan_br_referral();

COMMENT ON FUNCTION app_private.guard_jordan_br_referral() IS
  'Jordan belongs solely to BR: reject any AR/unknown dispatch with Jordan commercial attribution.';
COMMIT;
