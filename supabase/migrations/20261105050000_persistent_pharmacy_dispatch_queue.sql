-- Persistent pharmacy dispatch queue (Argentina and Brazil strictly isolated).
-- A zero-doctor search is normal. Patient requests remain 'searching' until
-- accepted or explicitly cancelled; individual doctor offers still expire.
-- Do not promise a queue rank or an ETA without backed counters.
BEGIN;

ALTER TABLE public.pharmacy_dispatch_requests
  ALTER COLUMN search_timeout_at DROP NOT NULL,
  ALTER COLUMN search_timeout_at DROP DEFAULT;

-- Existing active patients must not be evicted by the old 30-second cron.
UPDATE public.pharmacy_dispatch_requests
SET search_timeout_at = NULL
WHERE status = 'searching'
  AND search_timeout_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_waiting_market_fifo
  ON public.pharmacy_dispatch_requests(care_country, created_at, id)
  WHERE status = 'searching';

-- Preserve all existing clinical/country/authorization predicates from
-- production and change only waiting/offer-lifetime semantics.
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
BEGIN
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

  -- Precio por tier
  v_price := CASE
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


-- Heartbeat/guard activation is the missing event that retries queued patients.
-- The SELECT is market-scoped and FIFO, not a broadcast to AR and BR together.
CREATE OR REPLACE FUNCTION app_private.dispatch_waiting_patient_on_doctor_presence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $queue$
DECLARE
  v_country text;
  v_request_id uuid;
BEGIN
  IF NEW.is_on_duty IS DISTINCT FROM TRUE
     OR NEW.current_active_request_id IS NOT NULL
     OR NEW.last_heartbeat_at IS NULL
     OR NEW.last_heartbeat_at <= NOW() - INTERVAL '90 seconds'
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
$queue$;

DROP TRIGGER IF EXISTS trg_dispatch_on_doctor_presence ON public.doctor_duty_status;
CREATE TRIGGER trg_dispatch_on_doctor_presence
AFTER INSERT OR UPDATE OF is_on_duty, last_heartbeat_at, current_active_request_id
ON public.doctor_duty_status
FOR EACH ROW
EXECUTE FUNCTION app_private.dispatch_waiting_patient_on_doctor_presence();

-- The trigger function is internal; it must never be exposed as a client RPC.
REVOKE ALL ON FUNCTION app_private.dispatch_waiting_patient_on_doctor_presence()
  FROM PUBLIC, anon, authenticated;

COMMIT;
