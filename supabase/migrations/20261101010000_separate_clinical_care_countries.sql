-- Explicit care markets. No timezone, language, nationality or telephone backfill.
-- Historical records remain intact; new routing fails closed when country is unknown.
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.credential_country(p_type text, p_number text, p_uf text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT CASE
    WHEN NULLIF(btrim(p_number), '') IS NULL OR upper(btrim(p_number)) ~ '^PENDING' THEN NULL
    WHEN p_type IN ('MN', 'MP') THEN 'AR'
    WHEN p_type = 'CRM' AND p_uf IN
      ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO') THEN 'BR'
    ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION app_private.credential_country(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.credential_country(text,text,text) TO authenticated, service_role;

ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS care_country text
  GENERATED ALWAYS AS (app_private.credential_country(license_type,license_number,uf_brazil)) STORED;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS care_country text
  CHECK (care_country IN ('AR','BR'));
ALTER TABLE public.pharmacy_dispatch_requests ADD COLUMN IF NOT EXISTS care_country text
  CHECK (care_country IN ('AR','BR'));
ALTER TABLE public.pharmacy_consultation_requests ADD COLUMN IF NOT EXISTS care_country text
  CHECK (care_country IN ('AR','BR'));
CREATE INDEX IF NOT EXISTS doctors_care_country_active_idx ON public.doctors(care_country,id) WHERE active;
COMMENT ON COLUMN public.patients.care_country IS
  'Explicit patient care market, selected once. Never inferred from locale, timezone, citizenship or phone.';
COMMENT ON COLUMN public.doctors.care_country IS
  'Country of primary medical credential, not nationality. Does not certify current official license validity.';

CREATE OR REPLACE FUNCTION app_private.guard_patient_care_country()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.care_country IS NOT NULL
     AND NEW.care_country IS DISTINCT FROM OLD.care_country THEN
    RAISE EXCEPTION 'care_country_already_selected' USING ERRCODE='42501';
  END IF;
  IF NEW.care_country IS NOT NULL AND (TG_OP='INSERT' OR OLD.care_country IS NULL)
     AND auth.uid() IS DISTINCT FROM NEW.user_id
     AND NOT (current_user IN ('postgres','supabase_admin') AND auth.uid() IS NULL
       AND COALESCE(auth.jwt()->>'role','') NOT IN ('authenticated','anon'))
     AND COALESCE(auth.jwt()->>'role','') <> 'service_role'
     AND NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'care_country_selection_owner_required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_patient_care_country() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_patient_care_country ON public.patients;
CREATE TRIGGER trg_patient_care_country BEFORE INSERT OR UPDATE OF care_country ON public.patients
FOR EACH ROW EXECUTE FUNCTION app_private.guard_patient_care_country();

CREATE OR REPLACE FUNCTION app_private.viewer_care_country()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT CASE WHEN pr.role='doctor' THEN d.care_country ELSE p.care_country END
  FROM public.profiles pr
  LEFT JOIN public.patients p ON p.user_id=pr.user_id AND p.active IS TRUE
  LEFT JOIN public.doctors d ON d.user_id=pr.user_id AND d.active IS TRUE
  WHERE pr.user_id=auth.uid() AND pr.active IS TRUE LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION app_private.can_view_country_doctor(p_doctor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.doctors d WHERE d.id=p_doctor_id AND (
      d.user_id=auth.uid() OR public.is_system_admin() OR
      (d.active IS TRUE AND d.care_country=app_private.viewer_care_country())
    )
  );
$$;
CREATE OR REPLACE FUNCTION app_private.can_view_country_profile(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p_user_id=auth.uid() OR NOT EXISTS (
    SELECT 1 FROM public.doctors d WHERE d.user_id=p_user_id
      AND NOT app_private.can_view_country_doctor(d.id)
  );
$$;
CREATE OR REPLACE FUNCTION app_private.can_view_country_license(p_doctor_id uuid,p_type text,p_number text,p_uf text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.doctors d WHERE d.id=p_doctor_id AND (
    d.user_id=auth.uid() OR public.is_system_admin() OR (
      app_private.can_view_country_doctor(d.id) AND
      app_private.credential_country(p_type,p_number,p_uf)=app_private.viewer_care_country()
    )
  ));
$$;
GRANT USAGE ON SCHEMA app_private TO authenticated;
REVOKE ALL ON FUNCTION app_private.viewer_care_country(),app_private.can_view_country_doctor(uuid),
 app_private.can_view_country_profile(uuid),app_private.can_view_country_license(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.viewer_care_country(),app_private.can_view_country_doctor(uuid),
 app_private.can_view_country_profile(uuid),app_private.can_view_country_license(uuid,text,text,text) TO authenticated,service_role;
-- Anonymous clients cannot select a care country through a trusted patient identity.
DROP POLICY IF EXISTS country_doctor_directory ON public.doctors;
CREATE POLICY country_doctor_directory ON public.doctors AS RESTRICTIVE FOR SELECT TO authenticated
 USING (app_private.can_view_country_doctor(id));
DROP POLICY IF EXISTS country_doctor_directory_anon ON public.doctors;
CREATE POLICY country_doctor_directory_anon ON public.doctors AS RESTRICTIVE FOR SELECT TO anon USING (false);
DROP POLICY IF EXISTS country_doctor_license ON public.doctor_licenses;
CREATE POLICY country_doctor_license ON public.doctor_licenses AS RESTRICTIVE FOR SELECT TO authenticated
 USING (app_private.can_view_country_license(doctor_id,license_type,license_number,uf_brazil));
DROP POLICY IF EXISTS country_doctor_license_anon ON public.doctor_licenses;
CREATE POLICY country_doctor_license_anon ON public.doctor_licenses AS RESTRICTIVE FOR SELECT TO anon USING (false);
DROP POLICY IF EXISTS country_doctor_profiles ON public.profiles;
CREATE POLICY country_doctor_profiles ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING (app_private.can_view_country_profile(user_id));
DROP POLICY IF EXISTS country_doctor_profiles_anon ON public.profiles;
CREATE POLICY country_doctor_profiles_anon ON public.profiles AS RESTRICTIVE FOR SELECT TO anon
 USING (false);
DO $policies$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['doctor_availability','doctor_availability_overrides'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS country_doctor_availability ON public.%I',v_table);
    EXECUTE format('CREATE POLICY country_doctor_availability ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (app_private.can_view_country_doctor(doctor_id))',v_table);
    EXECUTE format('DROP POLICY IF EXISTS country_doctor_availability_anon ON public.%I',v_table);
    EXECUTE format('CREATE POLICY country_doctor_availability_anon ON public.%I AS RESTRICTIVE FOR SELECT TO anon USING (false)',v_table);
  END LOOP;
END $policies$;

CREATE OR REPLACE FUNCTION app_private.assert_care_country_pair(p_patient_id uuid,p_doctor_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_patient_country text; v_doctor_country text;
BEGIN
  SELECT care_country INTO v_patient_country FROM public.patients WHERE id=p_patient_id AND active IS TRUE;
  SELECT care_country INTO v_doctor_country FROM public.doctors WHERE id=p_doctor_id AND active IS TRUE;
  IF v_patient_country IS NULL OR v_doctor_country IS DISTINCT FROM v_patient_country THEN
    RAISE EXCEPTION 'care_country_mismatch_or_unset' USING ERRCODE='42501';
  END IF;
  RETURN v_patient_country;
END;
$$;
REVOKE ALL ON FUNCTION app_private.assert_care_country_pair(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.guard_clinical_care_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_country text; v_new jsonb := to_jsonb(NEW); v_old jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    v_old := to_jsonb(OLD);
    -- Preserve historical reads, cancellations, delivery/audit updates and metadata.
    -- Check reassignment, rescheduling, starting/resuming care and document issuance.
    IF NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
       AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
       AND v_new->>'country_code' IS NOT DISTINCT FROM v_old->>'country_code' THEN
      IF TG_TABLE_NAME='appointments' THEN
        IF NEW.start_time IS NOT DISTINCT FROM OLD.start_time
           AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
           AND NOT (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('confirmed','in_progress'))
        THEN RETURN NEW; END IF;
      ELSIF TG_TABLE_NAME='calls' THEN
        IF v_new->>'status' IS NOT DISTINCT FROM v_old->>'status'
           OR v_new->>'status' IN ('ended','declined','canceled')
        THEN RETURN NEW; END IF;
      ELSIF TG_TABLE_NAME='patient_care_team' THEN
        IF NOT (NEW.active IS TRUE AND OLD.active IS DISTINCT FROM true) THEN RETURN NEW; END IF;
      ELSIF v_new->>'status' IS NOT DISTINCT FROM v_old->>'status'
         OR v_new->>'status' IN ('cancelled','revoked','expired') THEN RETURN NEW;
      END IF;
    END IF;
  END IF;
  v_country := app_private.assert_care_country_pair(NEW.patient_id,NEW.doctor_id);
  IF TG_TABLE_NAME IN ('prescriptions','medical_certificates')
     AND v_new->>'country_code' IS DISTINCT FROM v_country THEN
    RAISE EXCEPTION 'care_country_document_mismatch' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_clinical_care_country() FROM PUBLIC,anon,authenticated,service_role;
DO $triggers$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['appointments','calls','patient_care_team','doctor_patient','appointment_waitlist','care_episodes','medical_orders','prescriptions','medical_certificates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_country_pair ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER trg_country_pair BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.guard_clinical_care_country()',v_table);
  END LOOP;
END $triggers$;

CREATE OR REPLACE FUNCTION app_private.guard_dispatch_care_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_country text; v_doctor uuid;
BEGIN
  IF TG_TABLE_NAME='dispatch_offers' THEN
    IF TG_OP='UPDATE' AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
       AND NEW.dispatch_request_id IS NOT DISTINCT FROM OLD.dispatch_request_id
       AND NEW.status <> 'accepted' THEN RETURN NEW; END IF;
    SELECT p.care_country INTO v_country FROM public.pharmacy_dispatch_requests r
    JOIN public.patients p ON p.id=r.patient_id AND p.care_country=r.care_country
    WHERE r.id=NEW.dispatch_request_id AND p.active IS TRUE;
    v_doctor := NEW.doctor_id;
  ELSIF TG_TABLE_NAME='pharmacy_dispatch_requests' THEN
    IF TG_OP='UPDATE' AND NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
       AND NEW.assigned_doctor_id IS NOT DISTINCT FROM OLD.assigned_doctor_id
       AND NEW.care_country IS NOT DISTINCT FROM OLD.care_country
       AND (NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status IN ('completed','cancelled','expired'))
    THEN RETURN NEW; END IF;
    SELECT care_country INTO v_country FROM public.patients WHERE id=NEW.patient_id AND active IS TRUE;
    IF v_country IS DISTINCT FROM NEW.care_country THEN
      RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
    END IF;
    v_doctor := NEW.assigned_doctor_id;
  ELSE
    -- Legacy requests have no patient FK: reject unknown country and mixed assignments.
    IF TG_OP='UPDATE' AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
      AND NEW.care_country IS NOT DISTINCT FROM OLD.care_country
      AND (NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status IN ('completed','cancelled','expired'))
    THEN RETURN NEW; END IF;
    v_country := NEW.care_country; v_doctor := NEW.doctor_id;
  END IF;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'care_country_required' USING ERRCODE='42501';
  END IF;
  IF v_doctor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.doctors
    WHERE id=v_doctor AND active IS TRUE AND care_country=v_country) THEN
    RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_dispatch_care_country() FROM PUBLIC,anon,authenticated,service_role;
DO $triggers$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['dispatch_offers','pharmacy_dispatch_requests','pharmacy_consultation_requests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_country_dispatch ON public.%I',v_table);
    EXECUTE format('CREATE TRIGGER zz_country_dispatch BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.guard_dispatch_care_country()',v_table);
  END LOOP;
END $triggers$;

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

  -- Limpiar ofertas expiradas previas para este dispatch
  DELETE FROM public.dispatch_offers
  WHERE dispatch_request_id = p_dispatch_id AND status = 'expired';

  -- Seleccionar 1 solo médico: on-duty, heartbeat reciente, no ya ofertado antes
  SELECT d.id INTO v_doctor_id
  FROM public.doctors d
  JOIN public.doctor_duty_status dds ON dds.doctor_id = d.id
  WHERE d.active IS TRUE
    AND d.care_country = v_req.care_country
    -- At minimum, a provisional or blank license cannot take a clinical dispatch.
    -- Official license validation remains a separate mandatory human approval.
    AND NULLIF(btrim(d.license_number), '') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING'
    AND dds.is_on_duty = true
    AND dds.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
    AND dds.current_active_request_id IS NULL   -- no está en otra consulta
    AND NOT EXISTS (
      SELECT 1 FROM public.dispatch_offers doe
      WHERE doe.dispatch_request_id = p_dispatch_id
        AND doe.doctor_id = d.id
    )  -- excluye a los que ya rechazaron o expiraron
  ORDER BY dds.duty_started_at ASC  -- FIFO: el que lleva más tiempo en guardia
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    -- No hay más médicos disponibles
    UPDATE public.pharmacy_dispatch_requests
    SET status = 'expired', updated_at = NOW()
    WHERE id = p_dispatch_id;
    RETURN jsonb_build_object('success', false, 'code', 'NO_DOCTORS_AVAILABLE');
  END IF;

  -- Crear la oferta al médico seleccionado (30s timeout)
  INSERT INTO public.dispatch_offers
    (dispatch_request_id, doctor_id, offered_at, expires_at, status, price_brl)
  VALUES
    (p_dispatch_id, v_doctor_id, NOW(), NOW() + INTERVAL '30 seconds', 'pending', v_price)
  RETURNING id INTO v_offer_id;

  -- Notificar solo a ese médico via pg_net (no broadcast)
  PERFORM app_private.send_authenticated_dispatch_push(
    (SELECT user_id FROM public.doctors WHERE id = v_doctor_id),
    'Nueva Consulta — Respondé en 30 seg',
    'Paciente ' || COALESCE(NULLIF(TRIM(v_req.patient_name), ''), 'en espera') || ' solicita atención inmediata.',
    jsonb_build_object(
      'type', 'pharmacy_dispatch_incoming',
      'request_id', p_dispatch_id::text,
      'offer_id', v_offer_id::text,
      'room_id', v_req.cloudflare_room_id,
      'patient_name', COALESCE(v_req.patient_name, ''),
      'symptom_summary', COALESCE(v_req.symptom_summary, ''),
      'tier', v_req.tier_requested::text,
      'time_to_live', '30'
    )
  );

  RETURN jsonb_build_object(
    'success',    true,
    'code',       'OFFER_SENT',
    'offer_id',   v_offer_id,
    'doctor_id',  v_doctor_id
  );
END;
$function$;

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

  IF v_req.care_country IS NULL OR v_req.care_country IS DISTINCT FROM
     app_private.assert_care_country_pair(v_req.patient_id,v_resolved_doc_id) THEN
    RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
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

CREATE OR REPLACE FUNCTION public.get_active_on_duty_doctors()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'name', CASE 
                WHEN TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) <> '' 
                THEN 'Dr. ' || TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))
                ELSE 'Dr. Médico de Guardia'
            END,
            'short_name', CASE
                WHEN COALESCE(p.last_name, '') <> '' THEN 'Dr. ' || p.last_name
                WHEN COALESCE(p.first_name, '') <> '' THEN 'Dr. ' || p.first_name
                ELSE 'Dr. de Guardia'
            END,
            'specialty', COALESCE(d.specialty, 'Medicina General'),
            'initials', UPPER(
                COALESCE(NULLIF(SUBSTRING(p.first_name, 1, 1), ''), 'M') || 
                COALESCE(NULLIF(SUBSTRING(p.last_name, 1, 1), ''), 'G')
            ),
            'status_text', CASE 
                WHEN dds.current_active_request_id IS NULL 
                     OR pdr.id IS NULL 
                     OR pdr.status IN ('completed', 'cancelled', 'expired') 
                     OR (pdr.status = 'matched' AND pdr.call_started_at IS NULL AND pdr.matched_at < NOW() - INTERVAL '60 seconds')
                THEN 'En línea'
                ELSE 'En consulta' 
            END,
            'is_available', (
                dds.current_active_request_id IS NULL 
                OR pdr.id IS NULL 
                OR pdr.status IN ('completed', 'cancelled', 'expired')
                OR (pdr.status = 'matched' AND pdr.call_started_at IS NULL AND pdr.matched_at < NOW() - INTERVAL '60 seconds')
            ),
            'registration', TRIM(COALESCE(d.license_type, 'MN') || ' ' || COALESCE(d.license_number, ''))
        )
    ) INTO v_result
    FROM public.doctor_duty_status dds
    JOIN public.doctors d ON d.id = dds.doctor_id
    LEFT JOIN public.profiles p ON p.user_id = d.user_id
    LEFT JOIN public.pharmacy_dispatch_requests pdr ON pdr.id = dds.current_active_request_id
    WHERE dds.is_on_duty = true
      AND d.active IS TRUE AND d.care_country=app_private.viewer_care_country()
      AND dds.last_heartbeat_at > (NOW() - INTERVAL '90 seconds');

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_duty_doctors_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    WITH unnested_tiers AS (
        SELECT unnest(active_tiers) AS tier, current_active_request_id
        FROM public.doctor_duty_status dds
        WHERE is_on_duty = true
          AND EXISTS (SELECT 1 FROM public.doctors d WHERE d.id=dds.doctor_id AND d.active IS TRUE AND d.care_country=app_private.viewer_care_country())
          AND last_heartbeat_at > (NOW() - INTERVAL '90 seconds')
    ),
    grouped_counts AS (
        SELECT 
            tier,
            count(*)::int AS online_count,
            count(*) FILTER (WHERE current_active_request_id IS NULL)::int AS free_count
        FROM unnested_tiers
        GROUP BY tier
    )
    SELECT jsonb_object_agg(
        tier,
        jsonb_build_object(
            'online_count', online_count,
            'free_count', free_count
        )
    ) INTO v_result
    FROM grouped_counts;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_doctor_busy_slots(p_doctor_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(start_time timestamp with time zone, end_time timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        a.start_time,
        COALESCE(a.end_time, a.start_time + (COALESCE(a.duration_minutes, 30) || ' minutes')::interval) AS end_time
    FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND (auth.role()='service_role' OR app_private.can_view_country_doctor(p_doctor_id))
      AND a.start_time >= (p_start_date::timestamp at time zone 'UTC')
      AND a.start_time < ((p_end_date + 1)::timestamp at time zone 'UTC')
      AND a.status NOT IN ('cancelled', 'no_show', 'rejected');
$function$;

CREATE OR REPLACE FUNCTION public.assign_dispatch_patient_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_country text;
BEGIN
  IF NEW.requested_by_user_id IS NOT NULL
    AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND (
      auth.uid() IS NULL
      OR auth.uid() IS DISTINCT FROM NEW.requested_by_user_id
    )
  THEN
    RAISE EXCEPTION 'dispatch_request_identity_denied' USING ERRCODE = '42501';
  END IF;

  -- Logged-in callers use the persisted patient market. Guest requests must
  -- explicitly supply a country; a phone/document shape cannot choose it.
  IF NEW.requested_by_user_id IS NOT NULL THEN
    SELECT care_country INTO v_country FROM public.patients
    WHERE user_id=NEW.requested_by_user_id AND active IS TRUE;
    IF v_country IS NULL THEN RAISE EXCEPTION 'care_country_required' USING ERRCODE='42501'; END IF;
    IF NEW.care_country IS NOT NULL AND NEW.care_country IS DISTINCT FROM v_country THEN
      RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
    END IF;
    NEW.care_country := v_country;
  ELSIF NEW.care_country IS NULL THEN
    RAISE EXCEPTION 'care_country_required' USING ERRCODE='42501';
  END IF;
  NEW.patient_id := public.ensure_dispatch_patient(
    NEW.requested_by_user_id,
    NEW.patient_dni,
    NEW.patient_cpf
  );
  SELECT care_country INTO v_country FROM public.patients WHERE id=NEW.patient_id;
  -- An existing unknown patient must choose country through the authenticated
  -- patient profile flow, never through a public kiosk knowing their document.
  IF v_country IS DISTINCT FROM NEW.care_country THEN
    RAISE EXCEPTION 'care_country_dispatch_mismatch_or_unset' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pharmacy_tiers_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  -- Count active doctors by tier and pending requests by tier
  WITH active_docs AS (
    SELECT 
      unnest(active_duty_tiers) AS tier,
      count(DISTINCT id) AS doc_count
    FROM public.doctors
    WHERE on_duty_pharmacy = true
      AND app_private.can_view_country_doctor(id)
    GROUP BY tier
  ),
  pending_reqs AS (
    SELECT 
      service_tier AS tier,
      count(*) AS req_count
    FROM public.pharmacy_consultation_requests
    WHERE status = 'pending'
      AND care_country=app_private.viewer_care_country()
    GROUP BY service_tier
  )
  SELECT jsonb_object_agg(
    coalesce(ad.tier, pr.tier),
    jsonb_build_object(
      'activeDoctors', coalesce(ad.doc_count, 0),
      'pendingQueue', coalesce(pr.req_count, 0),
      'etaMinutes', CASE 
        WHEN coalesce(ad.doc_count, 0) > 0 THEN 
          GREATEST(1, CEIL((coalesce(pr.req_count, 0) + 1)::float * 3.0 / ad.doc_count::float))::int
        ELSE 0
      END,
      'isAvailable', (coalesce(ad.doc_count, 0) > 0)
    )
  ) INTO v_result
  FROM active_docs ad
  FULL OUTER JOIN pending_reqs pr ON ad.tier = pr.tier;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$function$;

-- A credential cannot be silently moved between clinical markets after registration.
CREATE OR REPLACE FUNCTION app_private.guard_doctor_credential_country()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF app_private.credential_country(OLD.license_type,OLD.license_number,OLD.uf_brazil) IS NOT NULL
     AND app_private.credential_country(NEW.license_type,NEW.license_number,NEW.uf_brazil)
       IS DISTINCT FROM app_private.credential_country(OLD.license_type,OLD.license_number,OLD.uf_brazil) THEN
    RAISE EXCEPTION 'care_country_credential_change_requires_review' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_doctor_credential_country() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_doctor_credential_country ON public.doctors;
CREATE TRIGGER trg_doctor_credential_country BEFORE UPDATE OF license_type,license_number,uf_brazil
ON public.doctors FOR EACH ROW EXECUTE FUNCTION app_private.guard_doctor_credential_country();

CREATE OR REPLACE FUNCTION public.notify_on_duty_doctors_on_dispatch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    r_doctor RECORD;
    v_body TEXT;
    v_data JSONB;
    v_dedupe_key TEXT;
    v_patient_name TEXT;
BEGIN
    -- Validar que el estado sea 'searching'
    IF NEW.status <> 'searching' THEN
        RETURN NEW;
    END IF;

    v_patient_name := COALESCE(NULLIF(TRIM(NEW.patient_name), ''), 'Paciente');
    v_body := 'Paciente ' || COALESCE(NULLIF(TRIM(NEW.patient_name), ''), 'en espera') || ' solicita atención médica inmediata.';

    v_data := jsonb_build_object(
        'type', 'pharmacy_dispatch_incoming',
        'notification_type', 'pharmacy_dispatch_incoming',
        'request_id', NEW.id::text,
        'room_id', NEW.cloudflare_room_id,
        'patient_name', v_patient_name,
        'patient_dni', COALESCE(NEW.patient_dni, ''),
        'symptom_summary', COALESCE(NEW.symptom_summary, ''),
        'tier', NEW.tier_requested::text,
        'priority', 'high',
        'time_to_live', '30'
    );

    -- Buscar médicos con guardia activa (is_on_duty = true) y con FCM token válido
    FOR r_doctor IN
        SELECT d.user_id, p.fcm_token
        FROM public.doctor_duty_status dds
        JOIN public.doctors d ON d.id = dds.doctor_id
        JOIN public.profiles p ON p.user_id = d.user_id
        WHERE d.active IS TRUE
          AND d.care_country = NEW.care_country
          AND NULLIF(btrim(d.license_number), '') IS NOT NULL
          AND upper(btrim(d.license_number)) !~ '^PENDING'
          AND dds.is_on_duty = true
          AND p.fcm_token IS NOT NULL
          AND TRIM(p.fcm_token) <> ''
    LOOP
        v_dedupe_key := 'dispatch_' || NEW.id::text || '_' || r_doctor.user_id::text;

        -- 1. Encolar en notification_queue
        INSERT INTO public.notification_queue (
            user_id,
            type,
            title,
            body,
            deep_link,
            data,
            dedupe_key,
            scheduled_at,
            status
        ) VALUES (
            r_doctor.user_id,
            'PHARMACY_DISPATCH_INCOMING',
            'Nueva Consulta de Guardia On-Demand',
            v_body,
            'autamedica://dispatch/' || NEW.id::text,
            v_data,
            v_dedupe_key,
            NOW(),
            'pending'
        ) ON CONFLICT (dedupe_key) DO NOTHING;

        -- 2. Registrar en portal_notifications para auditoría y visualización en dashboard
        INSERT INTO public.portal_notifications (
            user_id,
            audience,
            category,
            type,
            title,
            body,
            action_url,
            dedupe_key,
            priority,
            context_data
        ) VALUES (
            r_doctor.user_id,
            'doctor',
            'appointment',
            'pharmacy_dispatch_incoming',
            'Nueva Consulta de Guardia On-Demand',
            v_body,
            '/doctors/dispatch/' || NEW.id::text,
            'portal_' || v_dedupe_key,
            'urgent',
            v_data
        ) ON CONFLICT (user_id, dedupe_key) DO NOTHING;

        -- 3. Invocar inmediatamente send-push-notification vía pg_net para despertar el teléfono del médico
        PERFORM app_private.send_authenticated_dispatch_push(
            r_doctor.user_id,
            'Nueva Consulta de Guardia On-Demand',
            v_body,
            v_data
        );

    END LOOP;

    RETURN NEW;
END;
$function$;


-- Raw records contain country-specific credentials and private banking/contact fields.
-- Patients consume a curated directory; RLS cannot redact columns inside a visible row.
CREATE OR REPLACE FUNCTION app_private.can_read_country_doctor_raw(p_doctor_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT auth.uid() IS NOT NULL AND (public.is_system_admin() OR EXISTS (
   SELECT 1 FROM public.doctors d WHERE d.id=p_doctor_id AND d.user_id=auth.uid()));
$$;
REVOKE ALL ON FUNCTION app_private.can_read_country_doctor_raw(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.can_read_country_doctor_raw(uuid) TO authenticated,service_role;
DROP POLICY IF EXISTS country_doctor_directory ON public.doctors;
CREATE POLICY country_doctor_directory ON public.doctors AS RESTRICTIVE FOR SELECT TO authenticated
 USING (app_private.can_read_country_doctor_raw(id));
CREATE OR REPLACE FUNCTION app_private.can_view_country_profile(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT p_user_id=auth.uid() OR public.is_system_admin() OR NOT EXISTS (
   SELECT 1 FROM public.doctors d WHERE d.user_id=p_user_id);
$$;
DROP POLICY IF EXISTS country_doctor_license ON public.doctor_licenses;
CREATE POLICY country_doctor_license ON public.doctor_licenses AS RESTRICTIVE FOR SELECT TO authenticated
 USING (app_private.can_read_country_doctor_raw(doctor_id));

CREATE OR REPLACE FUNCTION app_private.patient_doctor_directory()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',d.id,'user_id',d.user_id,'specialty',d.specialty,'subspecialty',d.subspecialty,
   'license_number',d.license_number,'license_type',d.license_type,'care_country',d.care_country,
   'uf_brazil',CASE WHEN d.care_country='BR' THEN d.uf_brazil END,
   'enrollment_jurisdiction',CASE WHEN d.care_country='AR' THEN d.enrollment_jurisdiction END,
   'consultation_fee',d.consultation_fee,'years_experience',d.years_experience,
   'bio',d.bio,'languages',d.languages,'active',d.active,'created_at',d.created_at,'updated_at',d.updated_at,
   'first_name',p.first_name,'last_name',p.last_name,'avatar_url',p.avatar_url,
   'sss_validation_status',CASE WHEN d.care_country='AR' THEN p.sss_validation_status END,
   'profile',jsonb_build_object('user_id',d.user_id,'first_name',p.first_name,'last_name',p.last_name,
     'avatar_url',p.avatar_url,'role','doctor',
     'sss_validation_status',CASE WHEN d.care_country='AR' THEN p.sss_validation_status END,
     'matricula_nacional',CASE WHEN d.care_country='AR' AND d.license_type='MN' THEN d.license_number END)
 ) ORDER BY d.created_at DESC),'[]'::jsonb)
 FROM public.doctors d JOIN public.profiles p ON p.user_id=d.user_id
 WHERE auth.uid() IS NOT NULL AND d.active IS TRUE
   AND d.care_country=app_private.viewer_care_country();
$$;
REVOKE ALL ON FUNCTION app_private.patient_doctor_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.patient_doctor_directory() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_patient_doctor_directory()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT app_private.patient_doctor_directory(); $$;
REVOKE ALL ON FUNCTION public.get_patient_doctor_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_patient_doctor_directory() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.guard_optional_physician_care_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_new jsonb := to_jsonb(NEW); v_old jsonb;
BEGIN
  IF TG_OP='UPDATE' AND NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
     AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id THEN
    v_old := to_jsonb(OLD);
    IF TG_TABLE_NAME='conversation_sessions' THEN
      IF v_new->>'status' IN ('closed','failed')
         AND (v_new - ARRAY['status','updated_at','ended_at','completed_at','error_message'])
           IS NOT DISTINCT FROM (v_old - ARRAY['status','updated_at','ended_at','completed_at','error_message']) THEN RETURN NEW; END IF;
    ELSIF (v_new - ARRAY['updated_at','deleted_at','updated_by','deleted_by'])
       IS NOT DISTINCT FROM (v_old - ARRAY['updated_at','deleted_at','updated_by','deleted_by']) THEN RETURN NEW;
    END IF;
  END IF;
  -- Patient-only records and AI conversations do not assign a physician.
  IF NEW.doctor_id IS NOT NULL THEN
    PERFORM app_private.assert_care_country_pair(NEW.patient_id,NEW.doctor_id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_optional_physician_care_country() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_country_optional_physician ON public.medical_records;
CREATE TRIGGER trg_country_optional_physician BEFORE INSERT OR UPDATE ON public.medical_records
FOR EACH ROW EXECUTE FUNCTION app_private.guard_optional_physician_care_country();
DROP TRIGGER IF EXISTS trg_country_optional_physician ON public.conversation_sessions;
CREATE TRIGGER trg_country_optional_physician BEFORE INSERT OR UPDATE ON public.conversation_sessions
FOR EACH ROW EXECUTE FUNCTION app_private.guard_optional_physician_care_country();

CREATE OR REPLACE FUNCTION app_private.guard_telemedicine_care_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_patient uuid; v_doctor uuid;
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
  PERFORM app_private.assert_care_country_pair(v_patient,v_doctor);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_telemedicine_care_country() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_country_telemedicine ON public.telemedicine_sessions;
CREATE TRIGGER trg_country_telemedicine BEFORE INSERT OR UPDATE ON public.telemedicine_sessions
FOR EACH ROW EXECUTE FUNCTION app_private.guard_telemedicine_care_country();
