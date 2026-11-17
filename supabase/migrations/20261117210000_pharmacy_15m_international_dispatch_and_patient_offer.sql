-- Fifteen-minute pharmacy search stages with opt-in, credential-backed cross-border routing.
-- Patient checkout stays in the patient's care-country currency. A foreign physician
-- is eligible only with a separately reviewed credential and an explicit payout route.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pharmacy_dispatch_cross_border_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_country text NOT NULL CHECK (patient_country IN ('AR','BR')),
  doctor_country text NOT NULL CHECK (doctor_country IN ('AR','BR') AND doctor_country<>patient_country),
  patient_currency text NOT NULL CHECK (
    (patient_country='AR' AND patient_currency='ARS')
    OR (patient_country='BR' AND patient_currency='BRL')
  ),
  doctor_currency text NOT NULL CHECK (
    (doctor_country='AR' AND doctor_currency='ARS')
    OR (doctor_country='BR' AND doctor_currency='BRL')
  ),
  doctor_fee_minor integer NOT NULL CHECK (doctor_fee_minor>0),
  enabled boolean NOT NULL DEFAULT false,
  change_reason text NOT NULL CHECK (char_length(btrim(change_reason))>=10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(patient_country,doctor_country)
);

ALTER TABLE public.pharmacy_dispatch_cross_border_routes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pharmacy_dispatch_cross_border_routes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.pharmacy_dispatch_cross_border_routes TO service_role;

ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS international_search_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS international_search_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS search_extension_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cross_border_route_id uuid REFERENCES public.pharmacy_dispatch_cross_border_routes(id),
  ADD COLUMN IF NOT EXISTS doctor_payout_fee_minor integer,
  ADD COLUMN IF NOT EXISTS doctor_payout_currency text;

ALTER TABLE public.dispatch_offers
  ADD COLUMN IF NOT EXISTS cross_border_route_id uuid REFERENCES public.pharmacy_dispatch_cross_border_routes(id);

CREATE INDEX IF NOT EXISTS idx_dispatch_cross_border_routes_enabled
  ON public.pharmacy_dispatch_cross_border_routes(patient_country,doctor_country)
  WHERE enabled IS TRUE;

CREATE OR REPLACE FUNCTION app_private.is_doctor_dispatch_approved_for_country(
  p_doctor_id uuid,
  p_target_country text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_home_country text;
  v_user_id uuid;
  v_sss_status text;
BEGIN
  IF p_doctor_id IS NULL OR p_target_country NOT IN ('AR','BR') THEN
    RETURN false;
  END IF;

  SELECT d.care_country,d.user_id
    INTO v_home_country,v_user_id
  FROM public.doctors d
  WHERE d.id=p_doctor_id AND d.active IS TRUE;

  IF NOT FOUND OR v_user_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT app_private.is_doctor_dispatch_approved(p_doctor_id) THEN
    RETURN false;
  END IF;
  IF v_home_country=p_target_country THEN
    RETURN true;
  END IF;

  SELECT p.sss_validation_status INTO v_sss_status
  FROM public.profiles p
  WHERE p.user_id=v_user_id AND p.active IS TRUE;

  IF p_target_country='AR' THEN
    RETURN COALESCE(v_sss_status IN ('valid','exempt'),false)
      AND EXISTS (
        SELECT 1
        FROM public.doctor_licenses l
        WHERE l.doctor_id=p_doctor_id
          AND l.status='active'
          AND l.license_type IN ('MN','MP')
          AND NULLIF(btrim(l.license_number),'') IS NOT NULL
          AND upper(btrim(l.license_number)) !~ '^PENDING'
          AND app_private.credential_country(l.license_type,l.license_number,l.uf_brazil)='AR'
      );
  END IF;

  IF p_target_country='BR' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.doctor_licenses l
      WHERE l.doctor_id=p_doctor_id
        AND l.status='active'
        AND l.license_type='CRM'
        AND NULLIF(btrim(l.license_number),'') IS NOT NULL
        AND upper(btrim(l.license_number)) !~ '^PENDING'
        AND NULLIF(btrim(l.uf_brazil),'') IS NOT NULL
        AND l.cfm_validation_status='valid'
        AND NULLIF(btrim(l.cfm_evidence_path),'') IS NOT NULL
        AND char_length(btrim(COALESCE(l.cfm_review_notes,'')))>=10
        AND l.cfm_reviewed_by IS NOT NULL
        AND l.cfm_reviewed_at IS NOT NULL
        AND app_private.credential_country(l.license_type,l.license_number,l.uf_brazil)='BR'
    );
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION app_private.is_doctor_dispatch_approved_for_country(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_doctor_dispatch_approved_for_country(uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION app_private.has_valid_pharmacy_dispatch_cross_border(
  p_patient_id uuid,
  p_doctor_id uuid,
  p_room_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.pharmacy_dispatch_requests r
    JOIN public.doctors d ON d.id=p_doctor_id
    JOIN public.pharmacy_dispatch_cross_border_routes route
      ON route.id=COALESCE(r.cross_border_route_id,(
        SELECT o.cross_border_route_id
        FROM public.dispatch_offers o
        WHERE o.dispatch_request_id=r.id
          AND o.doctor_id=p_doctor_id
          AND o.status='accepted'
          AND o.cross_border_route_id IS NOT NULL
        ORDER BY o.accepted_at DESC NULLS LAST
        LIMIT 1
      ))
    WHERE r.patient_id IS NOT DISTINCT FROM p_patient_id
      AND r.care_country=route.patient_country
      AND d.care_country=route.doctor_country
      AND (p_room_id IS NULL OR r.cloudflare_room_id=p_room_id)
      AND (
        (r.assigned_doctor_id=p_doctor_id AND r.status IN ('matched','in_call','completed'))
        OR EXISTS (
          SELECT 1
          FROM public.dispatch_offers o
          WHERE o.dispatch_request_id=r.id
            AND o.doctor_id=p_doctor_id
            AND o.status='accepted'
            AND o.cross_border_route_id=route.id
        )
      )
      AND app_private.is_doctor_dispatch_approved_for_country(p_doctor_id,route.patient_country)
  );
$function$;

REVOKE ALL ON FUNCTION app_private.has_valid_pharmacy_dispatch_cross_border(uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_valid_pharmacy_dispatch_cross_border(uuid,uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_pharmacy_dispatch_international_capacity(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_count integer := 0;
  v_routes jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id=p_dispatch_id;

  IF NOT FOUND OR v_req.status::text<>'searching'
     OR v_req.search_started_at IS NULL
     OR v_req.search_started_at>now()-interval '15 minutes' THEN
    RETURN jsonb_build_object('available',false,'eligible_doctors',0,'routes',v_routes,'code','LOCAL_SEARCH_IN_PROGRESS');
  END IF;

  WITH route_capacity AS (
    SELECT route.id,route.doctor_country,route.doctor_currency,route.doctor_fee_minor,
           count(DISTINCT d.id)::integer AS eligible_doctors
    FROM public.pharmacy_dispatch_cross_border_routes route
    JOIN public.doctors d ON d.care_country=route.doctor_country AND d.active IS TRUE
    JOIN public.doctor_duty_status duty ON duty.doctor_id=d.id
    WHERE route.enabled IS TRUE
      AND route.patient_country=v_req.care_country
      AND route.patient_currency=v_req.currency
      AND app_private.is_doctor_dispatch_approved_for_country(d.id,route.patient_country)
      AND duty.is_on_duty IS TRUE
      AND duty.current_active_request_id IS NULL
      AND (
        duty.active_tiers IS NULL OR cardinality(duty.active_tiers)=0
        OR 'general'::public.dispatch_tier_category=ANY(duty.active_tiers)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers pending
        WHERE pending.doctor_id=d.id AND pending.status='pending' AND pending.expires_at>now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers previous
        WHERE previous.dispatch_request_id=v_req.id
          AND previous.doctor_id=d.id
          AND (
            previous.status='accepted'
            OR (previous.status='pending' AND previous.expires_at>now())
            OR previous.offered_at>now()-interval '5 minutes'
          )
      )
    GROUP BY route.id,route.doctor_country,route.doctor_currency,route.doctor_fee_minor
  )
  SELECT COALESCE(sum(eligible_doctors),0)::integer,
         COALESCE(jsonb_agg(jsonb_build_object(
           'doctor_country',doctor_country,
           'doctor_currency',doctor_currency,
           'doctor_fee_minor',doctor_fee_minor,
           'eligible_doctors',eligible_doctors
         ) ORDER BY doctor_country),'[]'::jsonb)
    INTO v_count,v_routes
  FROM route_capacity
  WHERE eligible_doctors>0;

  RETURN jsonb_build_object(
    'available',v_count>0,
    'eligible_doctors',v_count,
    'routes',v_routes,
    'patient_country',v_req.care_country,
    'patient_currency',v_req.currency
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_pharmacy_dispatch_international_capacity(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pharmacy_dispatch_international_capacity(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.advance_pharmacy_dispatch_search(
  p_dispatch_id uuid,
  p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_availability jsonb;
  v_result jsonb;
BEGIN
  IF p_mode NOT IN ('continue_local','international') THEN
    RETURN jsonb_build_object('success',false,'code','INVALID_SEARCH_ACTION');
  END IF;

  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id=p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND OR v_req.status::text<>'searching' THEN
    RETURN jsonb_build_object('success',false,'code','REQUEST_NOT_SEARCHING');
  END IF;
  IF v_req.search_started_at IS NULL
     OR v_req.search_started_at>now()-interval '15 minutes' THEN
    RETURN jsonb_build_object('success',false,'code','LOCAL_SEARCH_IN_PROGRESS');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers o
    WHERE o.dispatch_request_id=v_req.id AND o.status='pending' AND o.expires_at>now()
  ) THEN
    RETURN jsonb_build_object('success',false,'code','DOCTOR_OFFER_IN_PROGRESS');
  END IF;

  IF p_mode='international' THEN
    v_availability := public.get_pharmacy_dispatch_international_capacity(p_dispatch_id);
    IF COALESCE((v_availability->>'available')::boolean,false) IS DISTINCT FROM true THEN
      RETURN jsonb_build_object('success',false,'code','INTERNATIONAL_ROUTE_UNAVAILABLE',
        'availability',v_availability);
    END IF;

    UPDATE public.pharmacy_dispatch_requests
    SET international_search_enabled=true,
        international_search_started_at=COALESCE(international_search_started_at,now()),
        search_started_at=now(),
        search_timeout_at=now()+interval '15 minutes',
        search_extension_count=search_extension_count+1,
        updated_at=now()
    WHERE id=p_dispatch_id;
  ELSE
    UPDATE public.pharmacy_dispatch_requests
    SET search_started_at=now(),
        search_timeout_at=now()+interval '15 minutes',
        search_extension_count=search_extension_count+1,
        updated_at=now()
    WHERE id=p_dispatch_id;
  END IF;

  v_result := public.match_dispatch_doctors(p_dispatch_id);
  RETURN jsonb_build_object(
    'success',true,
    'code',CASE WHEN p_mode='international' THEN 'INTERNATIONAL_SEARCH_STARTED' ELSE 'LOCAL_SEARCH_EXTENDED' END,
    'international_search_enabled',p_mode='international' OR v_req.international_search_enabled,
    'search_started_at',now(),
    'search_timeout_at',now()+interval '15 minutes',
    'dispatch_result',v_result
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_pharmacy_dispatch_search(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_pharmacy_dispatch_search(uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION app_private.match_dispatch_doctors_without_switch(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $function$
DECLARE
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
  v_doctor_id uuid;
  v_offer_id uuid;
  v_route_id uuid;
  v_payout_minor integer;
  v_payout_currency text;
  v_partner_code text;
  v_partner_active boolean;
BEGIN
  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id=p_dispatch_id AND status='searching'
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'code','NOT_SEARCHING');
  END IF;

  IF v_req.care_country IS NULL OR (
    v_req.patient_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id=v_req.patient_id AND p.active IS TRUE
        AND p.care_country=v_req.care_country
    )
  ) THEN
    RETURN jsonb_build_object('success',false,'code','CARE_COUNTRY_REQUIRED');
  END IF;

  SELECT * INTO v_config FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code=v_req.care_country;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'code','COUNTRY_PRICING_NOT_CONFIGURED');
  END IF;
  IF v_req.currency IS DISTINCT FROM v_config.currency
     OR v_req.price_minor IS DISTINCT FROM v_config.consultation_price_minor
     OR v_req.doctor_fee_minor IS DISTINCT FROM v_config.doctor_fee_minor THEN
    RETURN jsonb_build_object('success',false,'code','PHARMACY_QUOTE_MISMATCH');
  END IF;
  IF v_req.tier_requested::text<>'general' THEN
    RETURN jsonb_build_object('success',false,'code','PHARMACY_GENERAL_CONSULTATION_ONLY');
  END IF;

  IF v_req.referral_partner_id IS NOT NULL THEN
    SELECT p.code,p.active INTO v_partner_code,v_partner_active
    FROM public.commercial_referral_partners p
    WHERE p.id=v_req.referral_partner_id;
    IF NOT FOUND OR v_partner_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'referral_partner_inactive_or_missing' USING ERRCODE='23514';
    END IF;
    IF v_partner_code='JORDAN' AND v_req.tier_requested::text<>'general' THEN
      RAISE EXCEPTION 'jordan_general_consultation_only' USING ERRCODE='23514';
    END IF;
  END IF;

  IF v_config.require_payment_before_dispatch AND NOT EXISTS (
    SELECT 1 FROM public.pharmacy_dispatch_payments pay
    WHERE pay.dispatch_request_id=v_req.id AND pay.status='approved'
      AND pay.paid_at IS NOT NULL
      AND pay.currency=v_config.currency
      AND pay.amount_minor=v_config.consultation_price_minor
      AND (
        (pay.provider='mercadopago' AND pay.provider_payment_id ~ '^[0-9]{1,20}$')
        OR (left(COALESCE(pay.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
            AND NULLIF(pay.metadata->>'manual_override_by','') IS NOT NULL)
      )
  ) THEN
    RETURN jsonb_build_object('success',false,'code','COUNTRY_PAYMENT_REQUIRED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers e
    WHERE e.dispatch_request_id=p_dispatch_id
      AND e.status='pending' AND e.expires_at>now()
  ) THEN
    RETURN jsonb_build_object('success',true,'code','OFFER_ALREADY_PENDING');
  END IF;

  WITH candidates AS (
    SELECT d.id AS doctor_id,
           NULL::uuid AS route_id,
           v_req.doctor_fee_minor AS payout_minor,
           v_req.currency AS payout_currency,
           0 AS route_priority,
           dds.duty_started_at
    FROM public.doctors d
    JOIN public.doctor_duty_status dds ON dds.doctor_id=d.id
    WHERE d.active IS TRUE
      AND d.care_country=v_req.care_country
      AND app_private.is_doctor_dispatch_approved(d.id)
      AND NULLIF(btrim(d.license_number),'') IS NOT NULL
      AND upper(btrim(d.license_number)) !~ '^PENDING'
      AND dds.is_on_duty IS TRUE
      AND dds.current_active_request_id IS NULL
      AND (
        dds.active_tiers IS NULL OR cardinality(dds.active_tiers)=0
        OR v_req.tier_requested=ANY(dds.active_tiers)
        OR 'general'=ANY(dds.active_tiers)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers pending
        WHERE pending.doctor_id=d.id AND pending.status='pending'
          AND pending.expires_at>now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers previous
        WHERE previous.dispatch_request_id=p_dispatch_id AND previous.doctor_id=d.id
          AND (
            previous.status='accepted'
            OR (previous.status='pending' AND previous.expires_at>now())
            OR previous.offered_at>now()-interval '5 minutes'
          )
      )

    UNION ALL

    SELECT d.id AS doctor_id,
           route.id AS route_id,
           route.doctor_fee_minor AS payout_minor,
           route.doctor_currency AS payout_currency,
           1 AS route_priority,
           dds.duty_started_at
    FROM public.pharmacy_dispatch_cross_border_routes route
    JOIN public.doctors d ON d.care_country=route.doctor_country AND d.active IS TRUE
    JOIN public.doctor_duty_status dds ON dds.doctor_id=d.id
    WHERE v_req.international_search_enabled IS TRUE
      AND route.enabled IS TRUE
      AND route.patient_country=v_req.care_country
      AND route.patient_currency=v_req.currency
      AND app_private.is_doctor_dispatch_approved_for_country(d.id,route.patient_country)
      AND dds.is_on_duty IS TRUE
      AND dds.current_active_request_id IS NULL
      AND (
        dds.active_tiers IS NULL OR cardinality(dds.active_tiers)=0
        OR v_req.tier_requested=ANY(dds.active_tiers)
        OR 'general'=ANY(dds.active_tiers)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers pending
        WHERE pending.doctor_id=d.id AND pending.status='pending'
          AND pending.expires_at>now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers previous
        WHERE previous.dispatch_request_id=p_dispatch_id AND previous.doctor_id=d.id
          AND (
            previous.status='accepted'
            OR (previous.status='pending' AND previous.expires_at>now())
            OR previous.offered_at>now()-interval '5 minutes'
          )
      )
  )
  SELECT candidates.doctor_id,candidates.route_id,candidates.payout_minor,candidates.payout_currency
    INTO v_doctor_id,v_route_id,v_payout_minor,v_payout_currency
  FROM candidates
  ORDER BY candidates.route_priority ASC,
    (
      SELECT CASE
        WHEN COUNT(*)=0 THEN 0::numeric
        ELSE COUNT(*) FILTER (WHERE recent.status='accepted')::numeric/COUNT(*)::numeric
      END
      FROM (
        SELECT offer.status FROM public.dispatch_offers offer
        WHERE offer.doctor_id=candidates.doctor_id
        ORDER BY offer.offered_at DESC,offer.id DESC LIMIT 20
      ) recent
    ) DESC,
    (
      SELECT MAX(recent.offered_at)
      FROM (
        SELECT offer.offered_at FROM public.dispatch_offers offer
        WHERE offer.doctor_id=candidates.doctor_id
        ORDER BY offer.offered_at DESC,offer.id DESC LIMIT 20
      ) recent
    ) ASC NULLS FIRST,
    candidates.duty_started_at ASC NULLS FIRST,
    candidates.doctor_id ASC
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RETURN jsonb_build_object(
      'success',true,'queued',true,
      'code',CASE WHEN v_req.international_search_enabled THEN 'WAITING_FOR_ENABLED_NETWORK_DOCTOR' ELSE 'WAITING_FOR_COUNTRY_DOCTOR' END
    );
  END IF;

  INSERT INTO public.dispatch_offers (
    dispatch_request_id,doctor_id,offered_at,expires_at,status,
    price_brl,price_minor,currency,cross_border_route_id
  ) VALUES (
    p_dispatch_id,v_doctor_id,now(),now()+interval '30 seconds','pending',
    CASE WHEN v_payout_currency='BRL' THEN v_payout_minor::numeric/100 ELSE NULL END,
    v_payout_minor,v_payout_currency,v_route_id
  )
  ON CONFLICT (dispatch_request_id,doctor_id) DO UPDATE SET
    offered_at=now(),expires_at=now()+interval '30 seconds',status='pending',
    accepted_at=NULL,price_brl=EXCLUDED.price_brl,
    price_minor=EXCLUDED.price_minor,currency=EXCLUDED.currency,
    cross_border_route_id=EXCLUDED.cross_border_route_id
  RETURNING id INTO v_offer_id;

  BEGIN
    PERFORM app_private.send_authenticated_dispatch_push(
      (SELECT user_id FROM public.doctors WHERE id=v_doctor_id),
      'Nueva consulta disponible',
      'Abrí AutaMedica para revisar y aceptar la oferta.',
      jsonb_build_object(
        'type','pharmacy_dispatch_incoming',
        'request_id',p_dispatch_id::text,
        'offer_id',v_offer_id::text,
        'care_country',v_req.care_country,
        'doctor_country',(SELECT care_country FROM public.doctors WHERE id=v_doctor_id),
        'cross_border',v_route_id IS NOT NULL,
        'tier',v_req.tier_requested::text,
        'time_to_live','30'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'clinical_dispatch_push_deferred: %',SQLSTATE;
  END;

  RETURN jsonb_build_object(
    'success',true,'code','OFFER_SENT','offer_id',v_offer_id,
    'doctor_id',v_doctor_id,'cross_border',v_route_id IS NOT NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_pending_dispatch_offers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_doctor_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  SELECT d.id INTO v_doctor_id
  FROM public.doctors d
  JOIN public.doctor_duty_status duty ON duty.doctor_id=d.id
  WHERE d.user_id=v_user
    AND d.active IS TRUE
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND d.care_country IN ('AR','BR')
    AND NULLIF(btrim(d.license_number),'') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND duty.is_on_duty IS TRUE
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,
      'offer_id',o.id,
      'offer_expires_at',o.expires_at,
      'patient_dni',r.patient_dni,
      'patient_cpf',r.patient_cpf,
      'patient_phone',r.patient_phone,
      'patient_name',r.patient_name,
      'patient_avatar_url',patient_profile.avatar_url,
      'tier_requested',r.tier_requested,
      'symptom_summary',r.symptom_summary,
      'status',r.status,
      'assigned_doctor_id',r.assigned_doctor_id,
      'cloudflare_room_id',r.cloudflare_room_id,
      'care_country',r.care_country,
      'doctor_country',doctor.care_country,
      'cross_border',o.cross_border_route_id IS NOT NULL,
      'currency',o.currency,
      'price_minor',o.price_minor,
      'created_at',r.created_at
    ) ORDER BY r.created_at ASC)
    FROM public.dispatch_offers o
    JOIN public.pharmacy_dispatch_requests r ON r.id=o.dispatch_request_id
    JOIN public.doctors doctor ON doctor.id=v_doctor_id
    LEFT JOIN public.patients patient ON patient.id=r.patient_id
    LEFT JOIN public.profiles patient_profile ON patient_profile.user_id=patient.user_id
    WHERE o.doctor_id=v_doctor_id
      AND o.status='pending'
      AND o.expires_at>now()
      AND r.status='searching'
      AND (
        (o.cross_border_route_id IS NULL AND r.care_country=doctor.care_country)
        OR (
          o.cross_border_route_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.pharmacy_dispatch_cross_border_routes route
            WHERE route.id=o.cross_border_route_id
              AND route.patient_country=r.care_country
              AND route.doctor_country=doctor.care_country
              AND app_private.is_doctor_dispatch_approved_for_country(doctor.id,route.patient_country)
          )
        )
      )
  ),'[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_dispatch_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $function$
DECLARE
  v_offer public.dispatch_offers%ROWTYPE;
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_route public.pharmacy_dispatch_cross_border_routes%ROWTYPE;
  v_resolved_doc_id uuid;
  v_doctor_country text;
  v_call_id uuid;
  v_invite_id uuid;
  v_room_id text;
  v_payout_minor integer;
  v_payout_currency text;
BEGIN
  SELECT * INTO v_offer FROM public.dispatch_offers WHERE id=p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','offer_not_found'); END IF;
  IF v_offer.status<>'pending' THEN RETURN jsonb_build_object('success',false,'error','offer_not_pending'); END IF;
  IF v_offer.expires_at<=now() THEN
    UPDATE public.dispatch_offers SET status='expired' WHERE id=p_offer_id;
    RETURN jsonb_build_object('success',false,'error','offer_expired');
  END IF;

  SELECT d.id,d.care_country INTO v_resolved_doc_id,v_doctor_country
  FROM public.doctors d
  WHERE d.id=v_offer.doctor_id OR d.user_id=v_offer.doctor_id
  LIMIT 1;
  IF v_resolved_doc_id IS NULL THEN v_resolved_doc_id:=v_offer.doctor_id; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.id=v_resolved_doc_id AND d.active IS TRUE
      AND app_private.is_doctor_dispatch_approved(d.id)
      AND NULLIF(btrim(d.license_number),'') IS NOT NULL
      AND upper(btrim(d.license_number)) !~ '^PENDING'
  ) THEN
    RAISE EXCEPTION 'doctor_not_clinically_eligible' USING ERRCODE='42501';
  END IF;
  IF COALESCE(auth.jwt()->>'role','')<>'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.doctors d
       WHERE d.id=v_resolved_doc_id AND d.user_id=auth.uid() AND auth.uid() IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'No autorizado para aceptar esta oferta' USING ERRCODE='42501';
  END IF;

  UPDATE public.doctor_duty_status
  SET last_heartbeat_at=now(),updated_at=now()
  WHERE doctor_id=v_resolved_doc_id
    AND is_on_duty IS TRUE
    AND current_active_request_id IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','doctor_not_available');
  END IF;

  SELECT * INTO v_req FROM public.pharmacy_dispatch_requests
  WHERE id=v_offer.dispatch_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status::text<>'searching' OR v_req.care_country IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','request_not_searching_or_country_mismatch');
  END IF;

  IF v_offer.cross_border_route_id IS NULL THEN
    IF v_doctor_country IS DISTINCT FROM v_req.care_country THEN
      RETURN jsonb_build_object('success',false,'error','request_not_searching_or_country_mismatch');
    END IF;
    IF v_req.patient_id IS NOT NULL AND v_req.care_country IS DISTINCT FROM
       app_private.assert_care_country_pair(v_req.patient_id,v_resolved_doc_id) THEN
      RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
    END IF;
    IF v_offer.currency IS DISTINCT FROM v_req.currency
       OR v_offer.price_minor IS DISTINCT FROM v_req.doctor_fee_minor THEN
      RAISE EXCEPTION 'dispatch_offer_country_quote_mismatch' USING ERRCODE='23514';
    END IF;
    v_payout_minor:=v_req.doctor_fee_minor;
    v_payout_currency:=v_req.currency;
  ELSE
    SELECT * INTO v_route
    FROM public.pharmacy_dispatch_cross_border_routes
    WHERE id=v_offer.cross_border_route_id AND enabled IS TRUE;
    IF NOT FOUND
       OR v_route.patient_country IS DISTINCT FROM v_req.care_country
       OR v_route.patient_currency IS DISTINCT FROM v_req.currency
       OR v_route.doctor_country IS DISTINCT FROM v_doctor_country
       OR NOT app_private.is_doctor_dispatch_approved_for_country(v_resolved_doc_id,v_req.care_country) THEN
      RAISE EXCEPTION 'cross_border_route_or_secondary_license_invalid' USING ERRCODE='42501';
    END IF;
    IF v_req.patient_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id=v_req.patient_id AND p.active IS TRUE
        AND p.care_country=v_route.patient_country
    ) THEN
      RAISE EXCEPTION 'cross_border_patient_country_mismatch' USING ERRCODE='42501';
    END IF;
    IF v_offer.currency IS DISTINCT FROM v_route.doctor_currency
       OR v_offer.price_minor IS DISTINCT FROM v_route.doctor_fee_minor THEN
      RAISE EXCEPTION 'cross_border_doctor_payout_mismatch' USING ERRCODE='23514';
    END IF;
    v_payout_minor:=v_route.doctor_fee_minor;
    v_payout_currency:=v_route.doctor_currency;
  END IF;

  UPDATE public.dispatch_offers
  SET status='accepted',accepted_at=now()
  WHERE id=p_offer_id AND status='pending' AND expires_at>now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error','offer_expired');
  END IF;
  UPDATE public.dispatch_offers
  SET status='expired'
  WHERE dispatch_request_id=v_offer.dispatch_request_id
    AND id<>p_offer_id AND status='pending';

  v_room_id:=COALESCE(v_req.cloudflare_room_id,
    'room_pharm_'||floor(extract(epoch from now()))::bigint::text||'_'||substring(md5(random()::text) from 1 for 8));

  SELECT id INTO v_call_id FROM public.calls
  WHERE room_id=v_room_id ORDER BY created_at DESC LIMIT 1;
  IF v_call_id IS NULL THEN v_call_id:=gen_random_uuid(); END IF;

  SELECT id INTO v_invite_id FROM public.call_guest_invites
  WHERE call_id=v_call_id ORDER BY created_at DESC LIMIT 1;
  IF v_invite_id IS NULL THEN v_invite_id:=gen_random_uuid(); END IF;

  -- The accepted offer itself proves the reviewed cross-border route to
  -- the call trigger. Insert the referenced rows before writing their FKs
  -- back to the dispatch request.
  IF NOT EXISTS (SELECT 1 FROM public.calls WHERE id=v_call_id) THEN
    INSERT INTO public.calls(id,doctor_id,patient_id,room_id,status)
    VALUES(v_call_id,v_resolved_doc_id,v_req.patient_id,v_room_id,'requested');
  ELSE
    UPDATE public.calls
    SET doctor_id=v_resolved_doc_id,
        patient_id=COALESCE(patient_id,v_req.patient_id),
        status='requested'
    WHERE id=v_call_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.call_guest_invites WHERE id=v_invite_id) THEN
    INSERT INTO public.call_guest_invites(id,call_id,room_id,guest_name,expires_at)
    VALUES(v_invite_id,v_call_id,v_room_id,COALESCE(v_req.patient_name,'Paciente Farmacia'),now()+interval '24 hours');
  END IF;

  UPDATE public.pharmacy_dispatch_requests
  SET assigned_doctor_id=v_resolved_doc_id,
      cross_border_route_id=v_offer.cross_border_route_id,
      doctor_payout_fee_minor=v_payout_minor,
      doctor_payout_currency=v_payout_currency,
      call_id=v_call_id,
      guest_invite_id=v_invite_id,
      status='matched',
      matched_at=now(),
      price_brl=CASE WHEN v_req.currency='BRL' THEN v_req.price_minor::numeric/100 ELSE NULL END,
      price_minor=v_req.price_minor,
      currency=v_req.currency,
      doctor_fee_minor=v_req.doctor_fee_minor
  WHERE id=v_offer.dispatch_request_id;

  UPDATE public.doctor_duty_status
  SET current_active_request_id=v_offer.dispatch_request_id,updated_at=now()
  WHERE doctor_id=v_resolved_doc_id;

  RETURN jsonb_build_object(
    'success',true,
    'requestId',v_offer.dispatch_request_id::text,
    'callId',v_call_id::text,
    'roomId',v_room_id,
    'guestInviteId',v_invite_id::text,
    'doctorId',v_resolved_doc_id::text,
    'patientName',v_req.patient_name,
    'patientDni',v_req.patient_dni,
    'priceBrl',CASE WHEN v_payout_currency='BRL' THEN v_payout_minor::numeric/100 ELSE NULL END,
    'priceMinor',v_payout_minor,
    'doctorFeeMinor',v_payout_minor,
    'currency',v_payout_currency,
    'patientPriceMinor',v_req.price_minor,
    'patientCurrency',v_req.currency,
    'crossBorder',v_offer.cross_border_route_id IS NOT NULL,
    'assignedAt',now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_dispatch_care_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path='public','pg_temp'
AS $function$
DECLARE
  v_country text;
  v_doctor uuid;
  v_route_id uuid;
  v_route public.pharmacy_dispatch_cross_border_routes%ROWTYPE;
  v_doctor_country text;
BEGIN
  IF TG_TABLE_NAME='dispatch_offers' THEN
    IF TG_OP='UPDATE' AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
       AND NEW.dispatch_request_id IS NOT DISTINCT FROM OLD.dispatch_request_id
       AND NEW.cross_border_route_id IS NOT DISTINCT FROM OLD.cross_border_route_id
       AND NEW.status<>'accepted' THEN
      RETURN NEW;
    END IF;
    SELECT r.care_country INTO v_country
    FROM public.pharmacy_dispatch_requests r
    WHERE r.id=NEW.dispatch_request_id
      AND r.care_country IS NOT NULL
      AND (
        r.patient_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.patients p
          WHERE p.id=r.patient_id AND p.active IS TRUE AND p.care_country=r.care_country
        )
      );
    v_doctor:=NEW.doctor_id;
    v_route_id:=NEW.cross_border_route_id;
  ELSIF TG_TABLE_NAME='pharmacy_dispatch_requests' THEN
    IF TG_OP='UPDATE' AND NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
       AND NEW.assigned_doctor_id IS NOT DISTINCT FROM OLD.assigned_doctor_id
       AND NEW.care_country IS NOT DISTINCT FROM OLD.care_country
       AND NEW.cross_border_route_id IS NOT DISTINCT FROM OLD.cross_border_route_id
       AND (NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status IN ('completed','cancelled','expired')) THEN
      RETURN NEW;
    END IF;
    IF NEW.patient_id IS NULL THEN
      v_country:=NEW.care_country;
    ELSE
      SELECT care_country INTO v_country
      FROM public.patients
      WHERE id=NEW.patient_id AND active IS TRUE;
      IF v_country IS DISTINCT FROM NEW.care_country THEN
        RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
      END IF;
    END IF;
    v_doctor:=NEW.assigned_doctor_id;
    v_route_id:=NEW.cross_border_route_id;
  ELSE
    IF TG_OP='UPDATE' AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
      AND NEW.care_country IS NOT DISTINCT FROM OLD.care_country
      AND (NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status IN ('completed','cancelled','expired')) THEN
      RETURN NEW;
    END IF;
    v_country:=NEW.care_country;
    v_doctor:=NEW.doctor_id;
  END IF;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'care_country_required' USING ERRCODE='42501';
  END IF;

  IF v_doctor IS NOT NULL THEN
    SELECT d.care_country INTO v_doctor_country
    FROM public.doctors d
    WHERE d.id=v_doctor AND d.active IS TRUE;

    IF v_route_id IS NOT NULL THEN
      SELECT * INTO v_route
      FROM public.pharmacy_dispatch_cross_border_routes
      WHERE id=v_route_id;
      IF NOT FOUND
         OR v_route.patient_country IS DISTINCT FROM v_country
         OR v_route.doctor_country IS DISTINCT FROM v_doctor_country
         OR NOT app_private.is_doctor_dispatch_approved_for_country(v_doctor,v_country) THEN
        RAISE EXCEPTION 'cross_border_dispatch_route_invalid' USING ERRCODE='42501';
      END IF;
    ELSIF v_doctor_country IS DISTINCT FROM v_country THEN
      RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_clinical_care_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_country text;
  v_new jsonb:=to_jsonb(NEW);
  v_old jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    v_old:=to_jsonb(OLD);
    IF NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
       AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
       AND v_new->>'country_code' IS NOT DISTINCT FROM v_old->>'country_code' THEN
      IF TG_TABLE_NAME='appointments' THEN
        IF NEW.start_time IS NOT DISTINCT FROM OLD.start_time
           AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
           AND NOT (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('confirmed','in_progress')) THEN
          RETURN NEW;
        END IF;
      ELSIF TG_TABLE_NAME='calls' THEN
        IF v_new->>'status' IS NOT DISTINCT FROM v_old->>'status'
           OR v_new->>'status' IN ('ended','declined','canceled') THEN
          RETURN NEW;
        END IF;
      ELSIF TG_TABLE_NAME='patient_care_team' THEN
        IF NOT (NEW.active IS TRUE AND OLD.active IS DISTINCT FROM true) THEN
          RETURN NEW;
        END IF;
      ELSIF v_new->>'status' IS NOT DISTINCT FROM v_old->>'status'
         OR v_new->>'status' IN ('cancelled','revoked','expired') THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('calls','prescriptions','medical_certificates')
     AND v_new->>'appointment_id' IS NULL
     AND app_private.has_valid_pharmacy_dispatch_cross_border(NEW.patient_id,NEW.doctor_id,
       CASE WHEN TG_TABLE_NAME='calls' THEN v_new->>'room_id' ELSE NULL END) THEN
    SELECT r.care_country INTO v_country
    FROM public.pharmacy_dispatch_requests r
    WHERE r.patient_id IS NOT DISTINCT FROM NEW.patient_id
      AND r.assigned_doctor_id=NEW.doctor_id
      AND r.cross_border_route_id IS NOT NULL
      AND r.status IN ('matched','in_call','completed')
    ORDER BY r.matched_at DESC NULLS LAST LIMIT 1;
  ELSE
    v_country:=app_private.assert_care_country_pair(NEW.patient_id,NEW.doctor_id);
  END IF;

  IF TG_TABLE_NAME IN ('prescriptions','medical_certificates')
     AND v_new->>'country_code' IS DISTINCT FROM v_country THEN
    RAISE EXCEPTION 'care_country_document_mismatch' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.guard_telemedicine_care_country()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_patient uuid;
  v_doctor uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
     AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
     AND NEW.patient_profile_id IS NOT DISTINCT FROM OLD.patient_profile_id
     AND NEW.doctor_profile_id IS NOT DISTINCT FROM OLD.doctor_profile_id
     AND (NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status::text IN ('ended','completed','cancelled','canceled','failed')) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_patient FROM public.patients WHERE user_id=NEW.patient_id;
  SELECT id INTO v_doctor FROM public.doctors WHERE user_id=NEW.doctor_id;
  IF (NEW.patient_profile_id IS NOT NULL AND NEW.patient_profile_id IS DISTINCT FROM v_patient)
     OR (NEW.doctor_profile_id IS NOT NULL AND NEW.doctor_profile_id IS DISTINCT FROM v_doctor) THEN
    RAISE EXCEPTION 'care_country_session_identity_mismatch' USING ERRCODE='42501';
  END IF;
  IF NOT app_private.has_valid_pharmacy_dispatch_cross_border(v_patient,v_doctor,NEW.room_id) THEN
    PERFORM app_private.assert_care_country_pair(v_patient,v_doctor);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.record_pharmacy_dispatch_doctor_earning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
  v_route public.pharmacy_dispatch_cross_border_routes%ROWTYPE;
  v_fee_minor integer;
  v_currency text;
  v_payment_provenance text;
  v_manual_by text;
  v_manual_at text;
BEGIN
  IF NEW.status::text<>'completed' OR OLD.status::text='completed' OR NEW.assigned_doctor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_config
  FROM public.pharmacy_dispatch_pricing_configs
  WHERE country_code=NEW.care_country;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.cross_border_route_id IS NOT NULL THEN
    SELECT * INTO v_route
    FROM public.pharmacy_dispatch_cross_border_routes
    WHERE id=NEW.cross_border_route_id;
    IF NOT FOUND
       OR v_route.patient_country IS DISTINCT FROM NEW.care_country
       OR v_route.doctor_country IS DISTINCT FROM (
         SELECT care_country FROM public.doctors WHERE id=NEW.assigned_doctor_id
       )
       OR NEW.doctor_payout_currency IS DISTINCT FROM v_route.doctor_currency
       OR NEW.doctor_payout_fee_minor IS DISTINCT FROM v_route.doctor_fee_minor THEN
      RETURN NEW;
    END IF;
    v_fee_minor:=NEW.doctor_payout_fee_minor;
    v_currency:=NEW.doctor_payout_currency;
  ELSE
    v_fee_minor:=COALESCE(NULLIF(NEW.doctor_fee_minor,0),
      CASE WHEN NEW.doctor_fee_brl>0 THEN round(NEW.doctor_fee_brl*100)::integer END,
      v_config.doctor_fee_minor);
    v_currency:=COALESCE(NULLIF(NEW.currency,''),v_config.currency);
    IF v_currency<>v_config.currency THEN RETURN NEW; END IF;
  END IF;

  IF v_fee_minor<=0 THEN RETURN NEW; END IF;

  SELECT
    CASE WHEN left(COALESCE(p.provider_payment_id,''),16)='MANUAL_OVERRIDE_' THEN 'manual_override' ELSE 'mercadopago' END,
    CASE WHEN left(COALESCE(p.provider_payment_id,''),16)='MANUAL_OVERRIDE_' THEN p.metadata->>'manual_override_by' END,
    CASE WHEN left(COALESCE(p.provider_payment_id,''),16)='MANUAL_OVERRIDE_' THEN p.metadata->>'manual_override_at' END
  INTO v_payment_provenance,v_manual_by,v_manual_at
  FROM public.pharmacy_dispatch_payments p
  WHERE p.dispatch_request_id=NEW.id AND p.status='approved' AND p.paid_at IS NOT NULL
    AND p.currency=v_config.currency AND p.amount_minor=v_config.consultation_price_minor
    AND (
      (p.provider='mercadopago' AND p.provider_payment_id ~ '^[0-9]{1,20}$')
      OR (p.provider='manual' AND left(COALESCE(p.provider_payment_id,''),16)='MANUAL_OVERRIDE_'
        AND NULLIF(p.metadata->>'manual_override_by','') IS NOT NULL
        AND NULLIF(p.metadata->>'manual_override_at','') IS NOT NULL
        AND NULLIF(p.metadata->>'manual_override_reason','') IS NOT NULL
        AND NULLIF(p.metadata->>'manual_override_evidence_reference','') IS NOT NULL)
    )
  ORDER BY p.paid_at DESC NULLS LAST,p.created_at DESC LIMIT 1;

  IF v_config.require_payment_before_dispatch AND v_payment_provenance IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.doctor_earnings(
    doctor_id,appointment_id,appointment_payment_id,dispatch_request_id,
    gross_amount,platform_fee_amount,processor_fee_amount,net_amount,currency,status,metadata,created_at,updated_at
  ) VALUES (
    NEW.assigned_doctor_id,NULL,NULL,NEW.id,v_fee_minor,0,0,v_fee_minor,v_currency,'pending',
    jsonb_build_object(
      'source','pharmacy_dispatch',
      'dispatch_request_id',NEW.id,
      'care_country',NEW.care_country,
      'doctor_fee_minor',v_fee_minor,
      'currency',v_currency,
      'patient_currency',NEW.currency,
      'cross_border_route_id',NEW.cross_border_route_id,
      'payment_provenance',v_payment_provenance,
      'manual_override_by',v_manual_by,
      'manual_override_at',v_manual_at,
      'pricing_config_country',v_config.country_code
    ),
    now(),now()
  )
  ON CONFLICT (dispatch_request_id) WHERE dispatch_request_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$function$;

-- A new local search runs for 15 minutes; each accepted continuation opens another 15-minute stage.
DO $expiry$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.expire_stale_dispatch_requests()'::regprocedure)
    INTO v_definition;
  IF position('interval ''25 seconds''' IN lower(v_definition))>0 THEN
    v_definition:=replace(v_definition,'interval ''25 seconds''','interval ''15 minutes''');
    EXECUTE v_definition;
  ELSIF position('interval ''15 minutes''' IN lower(v_definition))=0 THEN
    RAISE EXCEPTION 'Unexpected stale-dispatch timeout definition; refusing silent migration';
  END IF;
END;
$expiry$;

DO $payment_activation$
DECLARE
  v_definition text;
  v_count integer;
BEGIN
  SELECT pg_get_functiondef('public.activate_paid_pharmacy_dispatch()'::regprocedure)
    INTO v_definition;
  v_count:=(length(lower(v_definition))-length(replace(lower(v_definition),'interval ''25 seconds''','')))/length('interval ''25 seconds''');
  IF v_count>0 THEN
    v_definition:=replace(v_definition,'interval ''25 seconds''','interval ''15 minutes''');
    EXECUTE v_definition;
  ELSIF position('interval ''15 minutes''' IN lower(v_definition))=0 THEN
    RAISE EXCEPTION 'Unexpected paid-dispatch activation timeout; refusing silent migration';
  END IF;
END;
$payment_activation$;

COMMIT;
