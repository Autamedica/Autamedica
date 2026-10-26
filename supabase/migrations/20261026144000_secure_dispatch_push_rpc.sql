-- Fix unauthorized push access while preserving the sequential dispatch engine.
-- No clinic, wallet, community or TDAH records are touched.
-- All credentials are supplied externally. No secrets are stored in git.
-- Setup gate: create two Vault secrets PER PROJECT:
--   autamedica_push_dispatch_secret: strong random secret, also assigned to
--       Edge Function PUSH_DISPATCH_SECRET in that same project.
--   autamedica_push_project_url: local project API base URL (without trailing /),
--       e.g. https://<project-ref>.supabase.co. Never point staging at production.
-- Deploy the DB and Edge Function together; no production rollout without this.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.send_authenticated_dispatch_push(
  p_user_id uuid, p_title text, p_body text, p_data jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $push$
DECLARE
  v_secret text;
  v_project_url text;
  v_request_id bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'dispatch_target_missing';
  END IF;

  SELECT s.decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets s
  WHERE s.name = 'autamedica_push_dispatch_secret'
  LIMIT 1;

  IF v_secret IS NULL OR length(v_secret) < 32 THEN
    -- Do not send an unauthenticated push; deployment requires provisioning.
    RAISE EXCEPTION 'dispatch_push_secret_not_configured';
  END IF;

  SELECT btrim(s.decrypted_secret) INTO v_project_url
  FROM vault.decrypted_secrets s
  WHERE s.name = 'autamedica_push_project_url'
  LIMIT 1;

  -- Prevent accidental staging -> production delivery or secret exfiltration
  -- to a configured external host. Every deployment has its own Vault URL.
  IF v_project_url IS NULL
    OR v_project_url !~ '^https://[a-z0-9-]+[.]supabase[.]co$'
  THEN
    RAISE EXCEPTION 'dispatch_push_project_url_not_configured';
  END IF;

  SELECT net.http_post(
    url := v_project_url || '/functions/v1/send-push-notification',
    body := jsonb_build_object(
      'userId', p_user_id,
      'title', p_title,
      'body', p_body,
      'data', COALESCE(p_data, '{}'::jsonb)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    )
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$push$;

REVOKE ALL ON FUNCTION app_private.send_authenticated_dispatch_push(uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;

-- Current sequential dispatch (the only path with an active offer).
CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    -- At minimum, a provisional or blank license cannot take a clinical dispatch.
    -- Official license validation remains a separate mandatory human approval.
    AND NULLIF(btrim(d.license_number), '') IS NOT NULL
    AND upper(btrim(d.license_number)) !~ '^PENDING(-|$)'
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
    SET status = 'no_doctors_available', updated_at = NOW()
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
$$;

-- Legacy broadcast trigger is currently detached, but keep its implementation
-- secure if an operator re-enables it after explicit clinical review.
CREATE OR REPLACE FUNCTION public.notify_on_duty_doctors_on_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
          AND NULLIF(btrim(d.license_number), '') IS NOT NULL
          AND upper(btrim(d.license_number)) !~ '^PENDING(-|$)'
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
$$;

-- These dispatch engines are internal: unauthorized clients cannot cause
-- offers to advance, change dispatch state or trigger privileged notifications.
REVOKE EXECUTE ON FUNCTION public.match_dispatch_doctors(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_expired_dispatch_offers()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_dispatch_doctors(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_expired_dispatch_offers() TO service_role;
