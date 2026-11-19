-- Permit only fully audited manual provider-id replacement during payment approval.
-- All other payment identity fields and ordinary provider IDs remain immutable.
CREATE OR REPLACE FUNCTION public.guard_pharmacy_dispatch_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.dispatch_request_id IS DISTINCT FROM OLD.dispatch_request_id
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.provider IS DISTINCT FROM OLD.provider
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
