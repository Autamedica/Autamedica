CREATE OR REPLACE FUNCTION app_private.match_dispatch_doctors_without_switch(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public','pg_temp'
AS $function$
DECLARE
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_config public.pharmacy_dispatch_pricing_configs%ROWTYPE;
  v_doctor_id uuid;
  v_offer_id uuid;
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

  SELECT d.id INTO v_doctor_id
  FROM public.doctors d
  JOIN public.doctor_duty_status dds ON dds.doctor_id=d.id
  WHERE d.active IS TRUE
    AND d.care_country=v_req.care_country
    AND app_private.is_doctor_dispatch_approved(d.id)
    AND NULLIF(btrim(d.license_number),'') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND dds.is_on_duty=true
    AND (
      dds.last_heartbeat_at>now()-interval '90 seconds'
      OR EXISTS (
        SELECT 1 FROM public.profiles fcm
        WHERE fcm.user_id=d.user_id AND NULLIF(btrim(fcm.fcm_token),'') IS NOT NULL
      )
    )
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
      SELECT 1 FROM public.dispatch_offers doe
      WHERE doe.dispatch_request_id=p_dispatch_id AND doe.doctor_id=d.id
        AND (
          doe.status='accepted'
          OR (doe.status='pending' AND doe.expires_at>now())
          OR doe.offered_at>now()-interval '5 minutes'
        )
    )
  ORDER BY dds.duty_started_at ASC
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RETURN jsonb_build_object('success',true,'queued',true,'code','WAITING_FOR_COUNTRY_DOCTOR');
  END IF;

  INSERT INTO public.dispatch_offers (
    dispatch_request_id,doctor_id,offered_at,expires_at,status,
    price_brl,price_minor,currency
  ) VALUES (
    p_dispatch_id,v_doctor_id,now(),now()+interval '30 seconds','pending',
    CASE WHEN v_req.care_country='BR' THEN v_req.doctor_fee_minor::numeric/100 ELSE NULL END,
    v_req.doctor_fee_minor,v_req.currency
  )
  ON CONFLICT (dispatch_request_id,doctor_id) DO UPDATE SET
    offered_at=now(),expires_at=now()+interval '30 seconds',status='pending',
    accepted_at=NULL,price_brl=EXCLUDED.price_brl,
    price_minor=EXCLUDED.price_minor,currency=EXCLUDED.currency
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
        'tier',v_req.tier_requested::text,
        'time_to_live','30'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'clinical_dispatch_push_deferred: %',SQLSTATE;
  END;

  RETURN jsonb_build_object('success',true,'code','OFFER_SENT','offer_id',v_offer_id,'doctor_id',v_doctor_id);
END;
$function$;


-- Preserve the legacy priceBrl response while making accepted AR offers currency-aware.
CREATE OR REPLACE FUNCTION public.claim_dispatch_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
DECLARE
  v_offer public.dispatch_offers%ROWTYPE;
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_resolved_doc_id UUID;
  v_call_id UUID;
  v_invite_id UUID;
  v_room_id TEXT;
BEGIN
  SELECT * INTO v_offer FROM public.dispatch_offers WHERE id=p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','offer_not_found'); END IF;
  IF v_offer.status <> 'pending' THEN RETURN jsonb_build_object('success',false,'error','offer_not_pending'); END IF;
  IF v_offer.expires_at <= NOW() THEN
    UPDATE public.dispatch_offers SET status='expired' WHERE id=p_offer_id;
    RETURN jsonb_build_object('success',false,'error','offer_expired');
  END IF;

  SELECT id INTO v_resolved_doc_id FROM public.doctors
  WHERE id=v_offer.doctor_id OR user_id=v_offer.doctor_id LIMIT 1;
  IF v_resolved_doc_id IS NULL THEN v_resolved_doc_id:=v_offer.doctor_id; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id=v_resolved_doc_id
    AND d.active IS TRUE AND app_private.is_doctor_dispatch_approved(d.id)
    AND NULLIF(btrim(d.license_number),'') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING') THEN
    RAISE EXCEPTION 'doctor_not_clinically_eligible' USING ERRCODE='42501';
  END IF;
  IF COALESCE(auth.jwt()->>'role','') <> 'service_role'
    AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id=v_resolved_doc_id
      AND d.user_id=auth.uid() AND auth.uid() IS NOT NULL) THEN
    RAISE EXCEPTION 'No autorizado para aceptar esta oferta' USING ERRCODE='42501';
  END IF;

  -- A pending, unexpired offer is already assigned to this doctor by FCM.
  -- Acceptance refreshes presence, while preserving duty and active-call locks.
  UPDATE public.doctor_duty_status SET last_heartbeat_at=NOW(),updated_at=NOW()
  WHERE doctor_id=v_resolved_doc_id AND is_on_duty IS TRUE
    AND current_active_request_id IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','doctor_not_available'); END IF;

  SELECT * INTO v_req FROM public.pharmacy_dispatch_requests
  WHERE id=v_offer.dispatch_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'searching' OR v_req.care_country IS NULL
    OR v_req.care_country IS DISTINCT FROM (SELECT d.care_country FROM public.doctors d WHERE d.id=v_resolved_doc_id) THEN
    RETURN jsonb_build_object('success',false,'error','request_not_searching_or_country_mismatch');
  END IF;
  IF v_req.care_country IS NULL OR v_req.care_country IS DISTINCT FROM
    app_private.assert_care_country_pair(v_req.patient_id,v_resolved_doc_id) THEN
    RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
  END IF;
  IF v_offer.currency IS DISTINCT FROM v_req.currency
     OR v_offer.price_minor IS DISTINCT FROM v_req.doctor_fee_minor
     OR v_req.currency NOT IN ('BRL','ARS') THEN
    RAISE EXCEPTION 'dispatch_offer_country_quote_mismatch' USING ERRCODE='23514';
  END IF;

  v_room_id:=COALESCE(v_req.cloudflare_room_id,'room_pharm_'||floor(extract(epoch from now()))::bigint::text||'_'||substring(md5(random()::text) from 1 for 8));
  SELECT id INTO v_call_id FROM public.calls WHERE room_id=v_room_id ORDER BY created_at DESC LIMIT 1;
  IF v_call_id IS NULL THEN
    INSERT INTO public.calls(doctor_id,patient_id,room_id,status) VALUES(v_resolved_doc_id,v_req.patient_id,v_room_id,'requested') RETURNING id INTO v_call_id;
  ELSE
    UPDATE public.calls SET doctor_id=v_resolved_doc_id,patient_id=COALESCE(patient_id,v_req.patient_id),status='requested' WHERE id=v_call_id;
  END IF;
  SELECT id INTO v_invite_id FROM public.call_guest_invites WHERE call_id=v_call_id ORDER BY created_at DESC LIMIT 1;
  IF v_invite_id IS NULL THEN
    INSERT INTO public.call_guest_invites(call_id,room_id,guest_name,expires_at)
    VALUES(v_call_id,v_room_id,COALESCE(v_req.patient_name,'Paciente Farmacia'),NOW()+INTERVAL '24 hours') RETURNING id INTO v_invite_id;
  END IF;

  UPDATE public.dispatch_offers SET status='accepted',accepted_at=NOW()
  WHERE id=p_offer_id AND status='pending' AND expires_at>NOW();
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','offer_expired'); END IF;
  UPDATE public.dispatch_offers SET status='expired'
  WHERE dispatch_request_id=v_offer.dispatch_request_id AND id<>p_offer_id AND status='pending';
  UPDATE public.pharmacy_dispatch_requests SET
    assigned_doctor_id=v_resolved_doc_id,
    call_id=v_call_id,
    guest_invite_id=v_invite_id,
    status='matched',
    matched_at=NOW(),
    price_brl=CASE WHEN v_req.currency='BRL' THEN v_req.price_minor::numeric/100 ELSE NULL END,
    price_minor=v_req.price_minor,
    currency=v_offer.currency,
    doctor_fee_minor=v_req.doctor_fee_minor
  WHERE id=v_offer.dispatch_request_id;
  UPDATE public.doctor_duty_status SET current_active_request_id=v_offer.dispatch_request_id,updated_at=NOW()
  WHERE doctor_id=v_resolved_doc_id;

  RETURN jsonb_build_object('success',true,'requestId',v_offer.dispatch_request_id::text,
    'callId',v_call_id::text,'roomId',v_room_id,'guestInviteId',v_invite_id::text,
    'doctorId',v_resolved_doc_id::text,'patientName',v_req.patient_name,
    'patientDni',v_req.patient_dni,'priceBrl',CASE WHEN v_offer.currency='BRL' THEN v_offer.price_minor::numeric/100 ELSE NULL END,
    'priceMinor',v_offer.price_minor,'doctorFeeMinor',v_req.doctor_fee_minor,
    'currency',v_offer.currency,'assignedAt',NOW());
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error',SQLERRM);
END;
$function$;
