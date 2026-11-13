-- Jordan dispatch phase 1: isolate general-service matching from pharmacy matching.
-- This preserves shared request/offer/call persistence while giving Jordan a
-- dedicated matcher, duty-tier eligibility and final assignment guard.
-- No production flags, payment settings, existing patient rows or balances change.
BEGIN;

-- Jordan's requested service is general medicine; the doctor's
-- registered specialty is NOT an exclusion criterion. A specialist may
-- receive a general consultation only when the doctor opted into the
-- 'general' service tier while activating duty. Clinical approval and licence
-- validation remain mandatory for every physician.
CREATE OR REPLACE FUNCTION app_private.is_jordan_br_eligible_doctor(p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $general_eligible$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.id = p_doctor_id
      AND d.active IS TRUE
      AND d.care_country = 'BR'
      AND app_private.is_doctor_dispatch_approved(d.id)
      AND nullif(btrim(d.license_number), '') IS NOT NULL
      AND upper(btrim(d.license_number)) !~ '^PENDING'
  );
$general_eligible$;

REVOKE ALL ON FUNCTION app_private.is_jordan_br_eligible_doctor(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.match_jordan_br_general_requests(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $jordan_match$
DECLARE
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_doctor_id uuid;
  v_offer_id uuid;
  v_partner_code text;
  v_partner_active boolean;
BEGIN
  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id = p_dispatch_id AND status = 'searching'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_SEARCHING');
  END IF;

  IF v_req.care_country IS DISTINCT FROM 'BR'
     OR v_req.tier_requested::text IS DISTINCT FROM 'general' THEN
    RAISE EXCEPTION 'jordan_br_general_only' USING ERRCODE = '23514';
  END IF;

  SELECT p.code, p.active
    INTO v_partner_code, v_partner_active
  FROM public.commercial_referral_partners p
  WHERE p.id = v_req.referral_partner_id;

  IF NOT FOUND OR v_partner_code IS DISTINCT FROM 'JORDAN'
     OR v_partner_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'jordan_partner_inactive_or_missing' USING ERRCODE = '23514';
  END IF;

  IF v_req.price_brl IS DISTINCT FROM 79.00
     OR v_req.doctor_fee_brl IS DISTINCT FROM 40.00 THEN
    RAISE EXCEPTION 'jordan_quote_missing_or_mismatch' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = v_req.patient_id
      AND p.active IS TRUE
      AND p.care_country = 'BR'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'CARE_COUNTRY_REQUIRED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers o
    WHERE o.dispatch_request_id = p_dispatch_id
      AND o.status = 'pending'
      AND o.expires_at > now()
  ) THEN
    RETURN jsonb_build_object('success', true, 'code', 'OFFER_ALREADY_PENDING');
  END IF;

  SELECT d.id INTO v_doctor_id
  FROM public.doctors d
  JOIN public.doctor_duty_status dds ON dds.doctor_id = d.id
  WHERE d.active IS TRUE
    AND d.care_country = 'BR'
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND app_private.is_jordan_br_eligible_doctor(d.id)
    AND nullif(btrim(d.license_number), '') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND dds.is_on_duty IS TRUE
    AND dds.last_heartbeat_at > now() - interval '90 seconds'
    AND dds.current_active_request_id IS NULL
    -- Explicit opt-in: a specialty label never grants general-duty eligibility.
    AND 'general'::public.dispatch_tier_category = ANY(dds.active_tiers)
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers pending
      WHERE pending.doctor_id = d.id
        AND pending.status = 'pending'
        AND pending.expires_at > now()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers previous
      WHERE previous.dispatch_request_id = p_dispatch_id
        AND previous.doctor_id = d.id
        AND (
          previous.status = 'accepted'
          OR (previous.status = 'pending' AND previous.expires_at > now())
          OR previous.offered_at > now() - interval '5 minutes'
        )
    )
  ORDER BY dds.duty_started_at ASC NULLS LAST, d.id
  LIMIT 1
  FOR UPDATE OF dds SKIP LOCKED;

  IF v_doctor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'queued', true,
      'code', 'WAITING_FOR_JORDAN_GENERAL_DOCTOR'
    );
  END IF;

  INSERT INTO public.dispatch_offers (
    dispatch_request_id, doctor_id, offered_at, expires_at, status, price_brl
  ) VALUES (
    p_dispatch_id, v_doctor_id, now(), now() + interval '30 seconds', 'pending', 40.00
  )
  ON CONFLICT (dispatch_request_id, doctor_id)
  DO UPDATE SET
    offered_at = now(),
    expires_at = now() + interval '30 seconds',
    status = 'pending',
    accepted_at = NULL,
    price_brl = 40.00
  RETURNING id INTO v_offer_id;

  BEGIN
    PERFORM app_private.send_authenticated_dispatch_push(
      (SELECT d.user_id FROM public.doctors d WHERE d.id = v_doctor_id),
      'Nova consulta Jordan',
      'Consulta médica geral no Brasil disponível. Abra AutaMedica para aceitar.',
      jsonb_build_object(
        'type', 'pharmacy_dispatch_incoming',
        'request_id', p_dispatch_id::text,
        'offer_id', v_offer_id::text,
        'care_country', 'BR',
        'tier', 'general',
        'referral_code', 'JORDAN',
        'time_to_live', '30'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'jordan_dispatch_push_deferred: %', SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'JORDAN_GENERAL_OFFER_SENT',
    'offer_id', v_offer_id,
    'doctor_id', v_doctor_id
  );
END;
$jordan_match$;

REVOKE ALL ON FUNCTION app_private.match_jordan_br_general_requests(uuid)
  FROM PUBLIC, anon, authenticated;

-- Defense in depth: an assignment cannot bypass the physician's active
-- general-service selection, even with a stale or forged offer.
CREATE OR REPLACE FUNCTION app_private.guard_jordan_general_service_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $jordan_assignment$
DECLARE
  v_partner_code text;
BEGIN
  IF NEW.status::text IS DISTINCT FROM 'matched' THEN
    RETURN NEW;
  END IF;

  SELECT p.code INTO v_partner_code
  FROM public.commercial_referral_partners p
  WHERE p.id = NEW.referral_partner_id;

  IF v_partner_code = 'JORDAN' THEN
    IF NEW.care_country IS DISTINCT FROM 'BR'
       OR NEW.tier_requested::text IS DISTINCT FROM 'general'
       OR NEW.assigned_doctor_id IS NULL
       OR NOT app_private.is_jordan_br_eligible_doctor(NEW.assigned_doctor_id)
       OR NOT EXISTS (
         SELECT 1
         FROM public.doctor_duty_status duty
         WHERE duty.doctor_id = NEW.assigned_doctor_id
           AND duty.is_on_duty IS TRUE
           AND duty.last_heartbeat_at > now() - interval '90 seconds'
           AND duty.current_active_request_id IS NULL
           AND 'general'::public.dispatch_tier_category = ANY(duty.active_tiers)
       ) THEN
      RAISE EXCEPTION 'jordan_general_service_not_enabled_or_doctor_ineligible'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$jordan_assignment$;

REVOKE ALL ON FUNCTION app_private.guard_jordan_general_service_assignment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_guard_jordan_general_service_assignment
  ON public.pharmacy_dispatch_requests;
CREATE TRIGGER zz_guard_jordan_general_service_assignment
BEFORE UPDATE OF assigned_doctor_id, status
ON public.pharmacy_dispatch_requests
FOR EACH ROW
EXECUTE FUNCTION app_private.guard_jordan_general_service_assignment();

COMMENT ON FUNCTION app_private.is_jordan_br_eligible_doctor(uuid) IS
  'Jordan BR: any approved licensed Brazilian physician may receive a general consultation when their duty configuration includes the general tier; specialty is not used as an exclusion.';


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
  -- Jordan BR requests use a dedicated general-consultation matcher. The ordinary
  -- Argentina/Brazil pharmacy dispatcher remains unchanged for every other
  -- referral channel.
  IF EXISTS (
    SELECT 1
    FROM public.pharmacy_dispatch_requests r
    JOIN public.commercial_referral_partners p ON p.id = r.referral_partner_id
    WHERE r.id = p_dispatch_id AND p.code = 'JORDAN'
  ) THEN
    RETURN app_private.match_jordan_br_general_requests(p_dispatch_id);
  END IF;

  -- Obtener el request (solo si sigue en búsqueda)
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

  -- Jordan is a BR-only commercial channel, never a clinical exemption.
  -- The referral ID was resolved server-side and is immutable after intake.
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

      -- The BEFORE INSERT quote trigger must have populated this exact
      -- amount. Do not update an inserted row from an AFTER INSERT trigger.
      IF v_req.price_brl IS DISTINCT FROM 79.00
         OR v_req.doctor_fee_brl IS DISTINCT FROM 40.00 THEN
        RAISE EXCEPTION 'jordan_quote_missing_or_mismatch' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;

  -- Non-Jordan pricing remains byte-for-byte equivalent to the existing
  -- production dispatcher. The R$40 figure is the doctor OFFER only.
  -- It must never replace the R$79 patient checkout price.
  v_price := CASE
    WHEN v_is_jordan THEN 40.00
    WHEN v_req.tier_requested::text ILIKE '%specialist%' THEN 159.90
    WHEN v_req.tier_requested::text ILIKE '%psych%'      THEN 179.90
    ELSE 69.90
  END;

  -- Never purge expired/declined offer history; it prevents immediate
  -- re-offers to a doctor who did not respond, while allowing a cooldown.
  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers e
    WHERE e.dispatch_request_id = p_dispatch_id
      AND e.status = 'pending'
      AND e.expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('success', true, 'code', 'OFFER_ALREADY_PENDING');
  END IF;

  -- Seleccionar 1 solo médico: on-duty, heartbeat reciente, no ya ofertado antes
  SELECT d.id INTO v_doctor_id
  FROM public.doctors d
  JOIN public.doctor_duty_status dds ON dds.doctor_id = d.id
  WHERE d.active IS TRUE
    AND d.care_country = v_req.care_country
    AND app_private.is_doctor_dispatch_approved(d.id)
    -- At minimum, a provisional or blank license cannot take a clinical dispatch.
    -- Official license validation remains a separate mandatory human approval.
    AND NULLIF(btrim(d.license_number), '') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND dds.is_on_duty = true
    AND dds.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND dds.current_active_request_id IS NULL   -- no está en otra consulta
    -- Offer only categories that this physician has enabled in guard duty.
    -- The acceptance RPC independently revalidates this predicate.
    AND (
      dds.active_tiers IS NULL
      OR cardinality(dds.active_tiers) = 0
      OR v_req.tier_requested = ANY(dds.active_tiers)
      OR 'general' = ANY(dds.active_tiers)
    )
    -- Do not send multiple simultaneous offers to the same professional.
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
  ORDER BY dds.duty_started_at ASC  -- FIFO: el que lleva más tiempo en guardia
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    -- No available professional is NOT a clinical or technical error.
    -- The patient stays in the persistent country-specific queue.
    RETURN jsonb_build_object(
      'success', true,
      'queued', true,
      'code', 'WAITING_FOR_COUNTRY_DOCTOR'
    );
  END IF;

  -- Crear la oferta al médico seleccionado (30s timeout)
  INSERT INTO public.dispatch_offers
    (dispatch_request_id, doctor_id, offered_at, expires_at, status, price_brl)
  VALUES
    (p_dispatch_id, v_doctor_id, NOW(), NOW() + INTERVAL '30 seconds', 'pending',
     CASE WHEN v_req.care_country = 'BR' THEN v_price ELSE NULL END)
  -- Unique (request, doctor) already exists. A retry after cooldown must
  -- reuse that row instead of violating the unique constraint.
  ON CONFLICT (dispatch_request_id, doctor_id)
  DO UPDATE SET
    offered_at = NOW(),
    expires_at = NOW() + INTERVAL '30 seconds',
    status = 'pending',
    accepted_at = NULL,
    price_brl = EXCLUDED.price_brl
  RETURNING id INTO v_offer_id;

  -- Push is best effort. The queue/offer is authoritative and must still
  -- commit if FCM, pg_net or Vault is temporarily unavailable.
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



-- Preserve the existing dispatcher ACL contract.
REVOKE ALL ON FUNCTION public.match_dispatch_doctors(uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;
