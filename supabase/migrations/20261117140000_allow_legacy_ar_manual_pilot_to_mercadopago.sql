-- Allow only the one-time conversion of an uncharged legacy AR manual-pilot
-- row into a real Mercado Pago checkout. All normal payment identity fields
-- remain immutable, and the conversion is traceable in payment metadata.
CREATE OR REPLACE FUNCTION public.guard_pharmacy_dispatch_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_legacy_manual_pilot_migration boolean;
BEGIN
  v_legacy_manual_pilot_migration :=
    OLD.provider = 'manual'
    AND OLD.status IN ('pending','failed')
    AND OLD.currency = 'ARS'
    AND OLD.metadata->>'country_code' = 'AR'
    AND OLD.metadata->>'payment_mode' = 'manual_pilot'
    AND OLD.metadata->>'manual_approval_pending' = 'true'
    AND OLD.provider_preference_id IS NULL
    AND OLD.provider_payment_id IS NULL
    AND NEW.provider = 'mercadopago'
    AND NEW.status = 'initializing'
    AND NEW.currency = OLD.currency
    AND NEW.amount_minor = OLD.amount_minor
    AND NEW.dispatch_request_id = OLD.dispatch_request_id
    AND NEW.provider_preference_id IS NULL
    AND NEW.provider_payment_id IS NULL
    AND NEW.metadata->>'country_code' = 'AR'
    AND NEW.metadata->>'legacy_payment_mode' = 'manual_pilot'
    AND NEW.metadata->>'payment_mode' = 'mercadopago_ar'
    AND NEW.metadata->>'manual_approval_pending' = 'false'
    AND NULLIF(NEW.metadata->>'manual_pilot_migrated_at','') IS NOT NULL;

  IF NEW.dispatch_request_id IS DISTINCT FROM OLD.dispatch_request_id
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR (NEW.provider IS DISTINCT FROM OLD.provider AND NOT v_legacy_manual_pilot_migration)
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR (OLD.provider_preference_id IS NOT NULL AND NEW.provider_preference_id IS DISTINCT FROM OLD.provider_preference_id)
    OR (
      OLD.provider_payment_id IS NOT NULL
      AND NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id
      AND NOT (
        left(COALESCE(NEW.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
        AND NULLIF(NEW.metadata->>'manual_override_by','') IS NOT NULL
        AND NULLIF(NEW.metadata->>'manual_override_at','') IS NOT NULL
        AND NULLIF(NEW.metadata->>'manual_override_reason','') IS NOT NULL
        AND NULLIF(NEW.metadata->>'manual_override_evidence_reference','') IS NOT NULL
      )
    )
  THEN
    RAISE EXCEPTION 'pharmacy_payment_identity_immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'refunded' AND NEW.status <> 'refunded' THEN
    RAISE EXCEPTION 'pharmacy_refunded_payment_terminal' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'approved' AND NEW.status IN ('initializing','pending','failed') THEN
    RAISE EXCEPTION 'pharmacy_approved_payment_cannot_regress' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
