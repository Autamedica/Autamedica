-- Jordan BR checkout is the gate before physician dispatch.
-- Legacy/non-Jordan dispatch behavior remains unchanged.
CREATE OR REPLACE FUNCTION public.trigger_match_dispatch_doctors()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partner_code text;
  v_payment_approved boolean := false;
BEGIN
  IF NEW.status <> 'searching' THEN
    RETURN NEW;
  END IF;

  SELECT p.code INTO v_partner_code
  FROM public.commercial_referral_partners p
  WHERE p.id = NEW.referral_partner_id;

  IF v_partner_code = 'JORDAN' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.pharmacy_dispatch_payments pay
      WHERE pay.dispatch_request_id = NEW.id
        AND pay.status = 'approved'
        AND pay.provider = 'mercadopago'
        AND pay.currency = 'BRL'
        AND pay.amount_minor = 7900
    ) INTO v_payment_approved;

    IF NOT v_payment_approved THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public.match_dispatch_doctors(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_jordan_after_payment_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_status text;
  v_partner_code text;
BEGIN
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.provider <> 'mercadopago'
     OR NEW.currency <> 'BRL'
     OR NEW.amount_minor <> 7900 THEN
    RETURN NEW;
  END IF;

  SELECT r.status, p.code
    INTO v_status, v_partner_code
  FROM public.pharmacy_dispatch_requests r
  LEFT JOIN public.commercial_referral_partners p
    ON p.id = r.referral_partner_id
  WHERE r.id = NEW.dispatch_request_id;

  IF v_status = 'searching' AND v_partner_code = 'JORDAN' THEN
    PERFORM public.match_dispatch_doctors(NEW.dispatch_request_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_jordan_dispatch_after_payment_approval
  ON public.pharmacy_dispatch_payments;
CREATE TRIGGER trg_jordan_dispatch_after_payment_approval
AFTER INSERT OR UPDATE OF status ON public.pharmacy_dispatch_payments
FOR EACH ROW
EXECUTE FUNCTION public.dispatch_jordan_after_payment_approval();
