-- A previously issued pharmacy offer cannot be claimed by an inactive or
-- provisional doctor, even before pending offers expire. The patient/call
-- linkage and existing service role workflow are preserved.
CREATE OR REPLACE FUNCTION public.claim_dispatch_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_offer public.dispatch_offers%ROWTYPE;
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_resolved_doc_id UUID;
  v_call_id UUID;
  v_invite_id UUID;
  v_room_id TEXT;
BEGIN
  -- 1. Validar oferta existe y está pendiente con bloqueo de fila
  SELECT * INTO v_offer 
  FROM public.dispatch_offers 
  WHERE id = p_offer_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_found');
  END IF;
  
  IF v_offer.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'offer_not_pending');
  END IF;
  
  IF v_offer.expires_at < NOW() THEN
    UPDATE public.dispatch_offers SET status = 'expired' WHERE id = p_offer_id;
    RETURN jsonb_build_object('success', false, 'error', 'offer_expired');
  END IF;

  -- Resolver ID del doctor
  SELECT id INTO v_resolved_doc_id
  FROM public.doctors
  WHERE id = v_offer.doctor_id OR user_id = v_offer.doctor_id
  LIMIT 1;

  IF v_resolved_doc_id IS NULL THEN
    v_resolved_doc_id := v_offer.doctor_id;
  END IF;

  -- All callers (including service-role dispatchers) must be limited to an
  -- active practitioner with a non-provisional credential. Official license
  -- verification remains a separate administrative obligation.
  IF NOT EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.id = v_resolved_doc_id
      AND d.active IS TRUE
      AND NULLIF(btrim(d.license_number), '') IS NOT NULL
      AND upper(btrim(d.license_number)) !~ '^PENDING'
  ) THEN
    RAISE EXCEPTION 'doctor_not_clinically_eligible' USING ERRCODE = '42501';
  END IF;

  -- Never authorize from a client-supplied doctorId or mutable metadata.
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
    AND NOT EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = v_resolved_doc_id
        AND d.user_id = auth.uid()
        AND auth.uid() IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'No autorizado para aceptar esta oferta' USING ERRCODE = '42501';
  END IF;
  
  -- 2. Marcar oferta como aceptada
  UPDATE public.dispatch_offers 
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = p_offer_id;

  -- Expirar otras ofertas concurrentes para este request
  UPDATE public.dispatch_offers
  SET status = 'expired'
  WHERE dispatch_request_id = v_offer.dispatch_request_id
    AND id <> p_offer_id
    AND status = 'pending';
  
  -- 3. Obtener y bloquear la solicitud en pharmacy_dispatch_requests
  SELECT * INTO v_req
  FROM public.pharmacy_dispatch_requests
  WHERE id = v_offer.dispatch_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'dispatch_request_not_found');
  END IF;

  v_room_id := COALESCE(v_req.cloudflare_room_id, 'room_pharm_' || floor(extract(epoch from now()))::bigint::text || '_' || substring(md5(random()::text) from 1 for 8));

  -- 4. Crear o enlazar llamada en calls
  SELECT id INTO v_call_id
  FROM public.calls
  WHERE room_id = v_room_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_call_id IS NULL THEN
    INSERT INTO public.calls (doctor_id, patient_id, room_id, status)
    VALUES (v_resolved_doc_id, v_req.patient_id, v_room_id, 'requested')
    RETURNING id INTO v_call_id;
  ELSE
    UPDATE public.calls
    SET doctor_id = v_resolved_doc_id,
        patient_id = COALESCE(patient_id, v_req.patient_id),
        status = 'requested'
    WHERE id = v_call_id;
  END IF;
   
  -- 5. Crear o reutilizar invitación de invitado
  SELECT id INTO v_invite_id
  FROM public.call_guest_invites
  WHERE call_id = v_call_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite_id IS NULL THEN
    INSERT INTO public.call_guest_invites (call_id, room_id, guest_name, expires_at)
    VALUES (v_call_id, v_room_id, COALESCE(v_req.patient_name, 'Paciente Farmacia'), NOW() + INTERVAL '24 hours')
    RETURNING id INTO v_invite_id;
  END IF;
   
  -- 6. Actualizar solicitud en public.pharmacy_dispatch_requests atómicamente
  UPDATE public.pharmacy_dispatch_requests
  SET 
    assigned_doctor_id = v_resolved_doc_id,
    call_id = v_call_id,
    guest_invite_id = v_invite_id,
    status = 'matched',
    matched_at = NOW(),
    price_brl = v_offer.price_brl
  WHERE id = v_offer.dispatch_request_id;

  -- 7. Marcar médico ocupado en doctor_duty_status
  UPDATE public.doctor_duty_status
  SET current_active_request_id = v_offer.dispatch_request_id,
      updated_at = NOW()
  WHERE doctor_id = v_resolved_doc_id;
   
  -- 8. Retornar resultado con datos completos
  RETURN jsonb_build_object(
    'success', true,
    'requestId', v_offer.dispatch_request_id::text,
    'callId', v_call_id::text,
    'roomId', v_room_id,
    'guestInviteId', v_invite_id::text,
    'doctorId', v_resolved_doc_id::text,
    'patientName', v_req.patient_name,
    'patientDni', v_req.patient_dni,
    'priceBrl', v_offer.price_brl,
    'assignedAt', NOW()
  );
   
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_dispatch_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_dispatch_offer(uuid) TO authenticated, service_role;
