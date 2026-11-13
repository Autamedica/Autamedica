-- Allow verified on-duty physicians with a registered FCM destination to receive
-- pharmacy offers after Android Doze suspends the in-process heartbeat loop.
-- Clinical approval, country, license, tier, busy-state and offer locks remain required.
BEGIN;

CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_req   public.pharmacy_dispatch_requests%ROWTYPE;
  v_price NUMERIC(6,2);
  v_doctor_id UUID;
  v_offer_id  UUID;
  v_partner_code text;
  v_partner_active boolean;
  v_is_jordan boolean := false;
BEGIN
  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id = p_dispatch_id AND status = 'searching'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_SEARCHING');
  END IF;

  IF v_req.care_country IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.patients p WHERE p.id=v_req.patient_id
      AND p.active IS TRUE AND p.care_country=v_req.care_country
  ) THEN
    RETURN jsonb_build_object('success',false,'code','CARE_COUNTRY_REQUIRED');
  END IF;

  IF v_req.referral_partner_id IS NOT NULL THEN
    SELECT p.code, p.active INTO v_partner_code, v_partner_active
    FROM public.commercial_referral_partners p
    WHERE p.id = v_req.referral_partner_id;
    IF NOT FOUND OR v_partner_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'referral_partner_inactive_or_missing' USING ERRCODE='23514';
    END IF;

    IF v_partner_code = 'JORDAN' THEN
      IF v_req.care_country IS DISTINCT FROM 'BR'
         OR v_req.tier_requested::text <> 'general' THEN
        RAISE EXCEPTION 'jordan_br_general_only' USING ERRCODE='23514';
      END IF;
      v_is_jordan := true;

      IF v_req.price_brl IS DISTINCT FROM 79.00
         OR v_req.doctor_fee_brl IS DISTINCT FROM 40.00 THEN
        RAISE EXCEPTION 'jordan_quote_missing_or_mismatch' USING ERRCODE='23514';
      END IF;

      -- Payment-first is enforced inside the matcher itself, not only by the
      -- insert/payment triggers. Presence retries and direct RPC calls must
      -- never emit a Jordan offer before Mercado Pago approves the BRL 79 fee.
      IF NOT EXISTS (
        SELECT 1
        FROM public.pharmacy_dispatch_payments pay
        WHERE pay.dispatch_request_id = v_req.id
          AND pay.status = 'approved'
          AND pay.provider = 'mercadopago'
          AND pay.currency = 'BRL'
          AND pay.amount_minor = 7900
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'JORDAN_PAYMENT_REQUIRED'
        );
      END IF;
    END IF;
  END IF;

  v_price := CASE
    WHEN v_is_jordan THEN 40.00
    WHEN v_req.tier_requested::text ILIKE '%specialist%' THEN 159.90
    WHEN v_req.tier_requested::text ILIKE '%psych%'      THEN 179.90
    ELSE 69.90
  END;

  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers e
    WHERE e.dispatch_request_id = p_dispatch_id
      AND e.status = 'pending'
      AND e.expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('success', true, 'code', 'OFFER_ALREADY_PENDING');
  END IF;

  SELECT d.id INTO v_doctor_id
  FROM public.doctors d
  JOIN public.doctor_duty_status dds ON dds.doctor_id = d.id
  WHERE d.active IS TRUE
    AND d.care_country = v_req.care_country
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND NULLIF(btrim(d.license_number), '') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND dds.is_on_duty = true
    AND (
      dds.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
      OR EXISTS (
        SELECT 1 FROM public.profiles fcm
        WHERE fcm.user_id = d.user_id
          AND NULLIF(BTRIM(fcm.fcm_token), '') IS NOT NULL
      )
    )
    AND dds.current_active_request_id IS NULL
    AND (
      dds.active_tiers IS NULL
      OR cardinality(dds.active_tiers) = 0
      OR v_req.tier_requested = ANY(dds.active_tiers)
      OR 'general' = ANY(dds.active_tiers)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers pending
      WHERE pending.doctor_id = d.id
        AND pending.status = 'pending'
        AND pending.expires_at > NOW()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers doe
      WHERE doe.dispatch_request_id = p_dispatch_id
        AND doe.doctor_id = d.id
        AND (
          doe.status = 'accepted'
          OR (doe.status = 'pending' AND doe.expires_at > NOW())
          OR doe.offered_at > NOW() - INTERVAL '5 minutes'
        )
    )
  ORDER BY dds.duty_started_at ASC
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'queued', true,
      'code', 'WAITING_FOR_COUNTRY_DOCTOR'
    );
  END IF;

  INSERT INTO public.dispatch_offers
    (dispatch_request_id, doctor_id, offered_at, expires_at, status, price_brl)
  VALUES
    (p_dispatch_id, v_doctor_id, NOW(), NOW() + INTERVAL '30 seconds', 'pending',
     CASE WHEN v_req.care_country = 'BR' THEN v_price ELSE NULL END)
  ON CONFLICT (dispatch_request_id, doctor_id)
  DO UPDATE SET
    offered_at = NOW(),
    expires_at = NOW() + INTERVAL '30 seconds',
    status = 'pending',
    accepted_at = NULL,
    price_brl = EXCLUDED.price_brl
  RETURNING id INTO v_offer_id;

  BEGIN
    PERFORM app_private.send_authenticated_dispatch_push(
    (SELECT user_id FROM public.doctors WHERE id = v_doctor_id),
    'Nueva consulta disponible',
    'Abrí AutaMedica para revisar y aceptar la oferta.',
    jsonb_build_object(
      'type', 'pharmacy_dispatch_incoming',
      'request_id', p_dispatch_id::text,
      'offer_id', v_offer_id::text,
      'care_country', v_req.care_country,
      'tier', v_req.tier_requested::text,
      'time_to_live', '30'
    )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'clinical_dispatch_push_deferred: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'success',    true,
    'code',       'OFFER_SENT',
    'offer_id',   v_offer_id,
    'doctor_id',  v_doctor_id
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_country_on_duty_capacity(p_care_country text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count integer;
BEGIN
  IF p_care_country NOT IN ('AR','BR') OR p_care_country IS NULL THEN
    RETURN 0;
  END IF;
  SELECT COUNT(*)::integer INTO v_count
  FROM public.doctors d
  JOIN public.doctor_duty_status s ON s.doctor_id=d.id
  WHERE d.care_country=p_care_country
    AND d.active IS TRUE
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND NULLIF(btrim(d.license_number),'') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND s.is_on_duty IS TRUE
    AND (
      s.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
      OR EXISTS (
        SELECT 1 FROM public.profiles fcm
        WHERE fcm.user_id = d.user_id
          AND NULLIF(BTRIM(fcm.fcm_token), '') IS NOT NULL
      )
    )
    AND s.current_active_request_id IS NULL
    -- Intake currently submits a general-tier request; count only doctors
    -- whose active guard configuration can actually accept that tier.
    AND (
      s.active_tiers IS NULL
      OR cardinality(s.active_tiers)=0
      OR 'general'::public.dispatch_tier_category=ANY(s.active_tiers)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers o
      WHERE o.doctor_id=d.id AND o.status='pending' AND o.expires_at>NOW()
    );
  RETURN COALESCE(v_count,0);
END;
$function$;


CREATE OR REPLACE FUNCTION app_private.dispatch_waiting_patient_on_doctor_presence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_country text;
  v_request_id uuid;
BEGIN
  IF NEW.is_on_duty IS DISTINCT FROM TRUE
     OR NEW.current_active_request_id IS NOT NULL
     OR (
       (NEW.last_heartbeat_at IS NULL
        OR NEW.last_heartbeat_at <= NOW() - INTERVAL '90 seconds')
       AND NOT EXISTS (
         SELECT 1
         FROM public.doctors d
         JOIN public.profiles fcm ON fcm.user_id = d.user_id
         WHERE d.id = NEW.doctor_id
           AND NULLIF(BTRIM(fcm.fcm_token), '') IS NOT NULL
       )
     )
  THEN
    RETURN NEW;
  END IF;

  SELECT d.care_country INTO v_country
  FROM public.doctors d
  WHERE d.id = NEW.doctor_id
    AND d.active IS TRUE
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND NULLIF(btrim(d.license_number), '') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND d.care_country IN ('AR','BR');

  IF v_country IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.id INTO v_request_id
  FROM public.pharmacy_dispatch_requests r
  WHERE r.status = 'searching'
    AND r.care_country = v_country
    AND (r.search_timeout_at IS NULL OR r.search_timeout_at > NOW())
    -- Doctor-presence retries must preserve Jordan's payment-first contract.
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.commercial_referral_partners partner
        WHERE partner.id = r.referral_partner_id
          AND partner.code = 'JORDAN'
      )
      OR EXISTS (
        SELECT 1
        FROM public.pharmacy_dispatch_payments pay
        WHERE pay.dispatch_request_id = r.id
          AND pay.status = 'approved'
          AND pay.provider = 'mercadopago'
          AND pay.currency = 'BRL'
          AND pay.amount_minor = 7900
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers o
      WHERE o.dispatch_request_id = r.id
        AND o.status = 'pending'
        AND o.expires_at > NOW()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers o
      WHERE o.dispatch_request_id = r.id
        AND o.doctor_id = NEW.doctor_id
        AND (o.status IN ('pending','accepted')
             OR o.offered_at > NOW() - INTERVAL '5 minutes')
    )
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT 1;

  IF v_request_id IS NOT NULL THEN
    BEGIN
      PERFORM public.match_dispatch_doctors(v_request_id);
    EXCEPTION WHEN OTHERS THEN
      -- A transient push/network error must not roll back doctor presence.
      -- Next heartbeat or the queue retry job can dispatch again.
      RAISE WARNING 'dispatch_waiting_patient_retry_failed: %', SQLSTATE;
    END;
  END IF;
  RETURN NEW;
END;
$function$;


-- set_doctor_duty_status already writes last_heartbeat_at=NOW() atomically
-- in both INSERT and ON CONFLICT UPDATE paths. Assert this invariant so future
-- edits cannot reintroduce the first-tap race.
DO $guard_activation$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.set_doctor_duty_status(uuid,boolean,public.dispatch_tier_category[])'::regprocedure)
    INTO v_definition;
  IF position('last_heartbeat_at' IN lower(v_definition)) = 0
     OR position('now()' IN lower(v_definition)) = 0 THEN
    RAISE EXCEPTION 'set_doctor_duty_status must stamp the initial heartbeat atomically';
  END IF;
END;
$guard_activation$;

COMMIT;
