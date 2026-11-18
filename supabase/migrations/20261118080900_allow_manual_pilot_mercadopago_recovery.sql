-- Allow only the controlled recovery of pending Argentine manual_pilot rows.
-- The Argentina checkout continues to be created by the HMAC broker in empresa.autamedica.com.
CREATE OR REPLACE FUNCTION public.guard_pharmacy_dispatch_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  allow_manual_pilot_recovery boolean := false;
BEGIN
  IF NEW.provider IS DISTINCT FROM OLD.provider THEN
    allow_manual_pilot_recovery :=
      OLD.provider = 'manual'
      AND NEW.provider = 'mercadopago'
      AND OLD.status = 'pending'
      AND COALESCE(OLD.metadata->>'payment_mode', '') = 'manual_pilot'
      AND OLD.metadata->>'manual_approval_pending' = 'true'
      AND NEW.status = 'initializing'
      AND NEW.metadata->>'payment_mode' = 'mercadopago'
      AND NEW.metadata->>'manual_approval_pending' = 'false'
      AND NULLIF(NEW.metadata->>'recovered_from_manual_placeholder_at', '') IS NOT NULL
      AND OLD.provider_preference_id IS NULL
      AND OLD.provider_payment_id IS NULL
      AND OLD.checkout_url IS NULL
      AND OLD.paid_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.pharmacy_dispatch_payments prior
        WHERE prior.dispatch_request_id = OLD.dispatch_request_id
          AND prior.id <> OLD.id
          AND (prior.status = 'approved' OR prior.paid_at IS NOT NULL)
      );
  END IF;

  IF NEW.dispatch_request_id IS DISTINCT FROM OLD.dispatch_request_id
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR (NEW.provider IS DISTINCT FROM OLD.provider AND NOT allow_manual_pilot_recovery)
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
