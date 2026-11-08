-- Jordan commercial rule: at most one provisional R$10 eligibility per
-- normalized BR contact for its entire referral history. Refunds reverse it;
-- a reversed acquisition is still the first contact and is not recredited.
-- LIMITATION: guest phone ownership is not verified. This is a conservative
-- guard against repeat commissions, NOT evidence of unique verified persons
-- or approval for automatic partner transfer.
-- Other referral partners' existing behavior is unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_pharmacy_referral_commission()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $jordan_first$
DECLARE
  v_partner uuid;
  v_country text;
  v_partner_code text;
  v_partner_active boolean;
  v_phone text;
BEGIN
  IF NEW.status = 'approved' THEN
    SELECT d.referral_partner_id,d.care_country,d.patient_phone,p.code,p.active
      INTO v_partner,v_country,v_phone,v_partner_code,v_partner_active
    FROM public.pharmacy_dispatch_requests d
    LEFT JOIN public.commercial_referral_partners p
      ON p.id=d.referral_partner_id
    WHERE d.id=NEW.dispatch_request_id;

    IF v_partner IS NULL OR v_country IS DISTINCT FROM 'BR' THEN
      RETURN NEW;
    END IF;

    IF v_partner_code = 'JORDAN' THEN
      IF v_partner_active IS DISTINCT FROM TRUE THEN
        RETURN NEW;
      END IF;
      -- Only a reconciled payment is capable of opening an eligibility.
      IF NEW.provider IS DISTINCT FROM 'mercadopago'
         OR NEW.amount_minor IS DISTINCT FROM 7900
         OR NEW.currency IS DISTINCT FROM 'BRL'
         OR NEW.provider_payment_id IS NULL
         OR NEW.provider_payment_id !~ '^[0-9]{1,20}$'
         OR NEW.paid_at IS NULL
      THEN
        RETURN NEW;
      END IF;

      -- Compare commercial contacts, not patient_id: guest dispatch creates
      -- a fresh unlinked patient profile on every request.
      v_phone := regexp_replace(COALESCE(v_phone,''), '[^0-9]', '', 'g');
      IF left(v_phone,2)='55' AND length(v_phone) IN (12,13) THEN
        v_phone := substring(v_phone FROM 3);
      END IF;
      -- No commission when the submitted BR contact is not comparable.
      IF length(v_phone) NOT IN (10,11) THEN
        RETURN NEW;
      END IF;

      -- Serialize simultaneous approved payment webhooks for one contact.
      PERFORM pg_advisory_xact_lock(hashtext(v_partner::text),hashtext(v_phone));

      -- Include reversed commissions, so one refunded first sale cannot
      -- cause a second acquisition commission on a repeat consultation.
      IF EXISTS (
        SELECT 1
        FROM public.commercial_referral_commissions c
        JOIN public.pharmacy_dispatch_requests prior
          ON prior.id=c.dispatch_request_id
        CROSS JOIN LATERAL (
          SELECT regexp_replace(COALESCE(prior.patient_phone,''), '[^0-9]', '', 'g') AS digits
        ) norm
        WHERE c.referral_partner_id=v_partner
          AND c.dispatch_request_id<>NEW.dispatch_request_id
          AND (
            CASE
              WHEN left(norm.digits,2)='55' AND length(norm.digits) IN (12,13)
                THEN substring(norm.digits FROM 3)
              ELSE norm.digits
            END
          )=v_phone
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    INSERT INTO public.commercial_referral_commissions (
      dispatch_request_id,dispatch_payment_id,referral_partner_id,
      amount_minor,currency,status
    ) VALUES (
      NEW.dispatch_request_id,NEW.id,v_partner,1000,'BRL','eligible'
    ) ON CONFLICT (dispatch_request_id) DO NOTHING;

  ELSIF NEW.status IN ('refunded','cancelled','rejected') THEN
    UPDATE public.commercial_referral_commissions
       SET status='reversed',reversed_at=now()
     WHERE dispatch_payment_id=NEW.id AND status='eligible';
  END IF;
  RETURN NEW;
END;
$jordan_first$;

COMMENT ON FUNCTION public.sync_pharmacy_referral_commission() IS
  'Provisional commercial accounting: Jordan gets one R$10 eligibility per normalized BR contact, not per payment. Guest phone is not verified identity; manual reconciliation required before any transfer.';

REVOKE ALL ON FUNCTION public.sync_pharmacy_referral_commission()
  FROM PUBLIC, anon, authenticated;

COMMIT;
