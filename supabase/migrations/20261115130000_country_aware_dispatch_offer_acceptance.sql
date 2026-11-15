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
     OR v_offer.price_minor IS DISTINCT FROM v_req.price_minor
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
    price_brl=CASE WHEN v_offer.currency='BRL' THEN v_offer.price_minor::numeric/100 ELSE NULL END,
    price_minor=v_offer.price_minor,
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
