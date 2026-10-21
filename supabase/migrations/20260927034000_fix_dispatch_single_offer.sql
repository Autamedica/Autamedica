-- AUDIT RECONSTRUCTION - restored from production Supabase migration ledger.
-- Version: 20260927034000; name: fix_dispatch_single_offer.
-- Draft only. Must be tested on a FULL clean staging schema before merge.

-- Migration: 20260927034000_fix_dispatch_single_offer.sql
-- Description: Fix cola Uber — un médico a la vez (LIMIT 1), 30s timeout.
--   El trigger viejo (broadcast push) se elimina.
--   match_dispatch_doctors pasa a ser secuencial: 1 oferta → si expira → siguiente.

-- 1. Eliminar trigger de broadcast masivo (Gen 1.5 legacy)
DROP TRIGGER IF EXISTS trg_notify_on_duty_doctors_on_dispatch ON public.pharmacy_dispatch_requests;

-- 2. Reemplazar match_dispatch_doctors para que ofrezca solo a 1 médico por vez
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
  WHERE dds.is_on_duty = true
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
  PERFORM net.http_post(
    url     := 'https://qxjjrpksmwwrmubhvjew.supabase.co/functions/v1/send-push-notification',
    body    := jsonb_build_object(
      'doctorId', (SELECT user_id FROM public.doctors WHERE id = v_doctor_id),
      'title',    'Nueva Consulta — Respondé en 30 seg',
      'body',     'Paciente ' || COALESCE(NULLIF(TRIM(v_req.patient_name), ''), 'en espera') || ' solicita atención inmediata.',
      'data',     jsonb_build_object(
        'type',        'pharmacy_dispatch_incoming',
        'request_id',  p_dispatch_id::text,
        'offer_id',    v_offer_id::text,
        'room_id',     v_req.cloudflare_room_id,
        'patient_name', COALESCE(v_req.patient_name, ''),
        'symptom_summary', COALESCE(v_req.symptom_summary, ''),
        'tier',        v_req.tier_requested::text,
        'time_to_live', '30'
      )
    ),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );

  RETURN jsonb_build_object(
    'success',    true,
    'code',       'OFFER_SENT',
    'offer_id',   v_offer_id,
    'doctor_id',  v_doctor_id
  );
END;
$$;

-- 3. Función para avanzar la cola cuando una oferta expira (llamada por cron)
CREATE OR REPLACE FUNCTION public.advance_expired_dispatch_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offer RECORD;
BEGIN
  FOR v_offer IN
    SELECT do2.id, do2.dispatch_request_id
    FROM public.dispatch_offers do2
    WHERE do2.status = 'pending'
      AND do2.expires_at < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Marcar oferta como expirada
    UPDATE public.dispatch_offers
    SET status = 'expired'
    WHERE id = v_offer.id;

    -- Intentar despachar al siguiente médico
    PERFORM public.match_dispatch_doctors(v_offer.dispatch_request_id);
  END LOOP;
END;
$$;

-- 4. Registrar cron (si pg_cron disponible)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('advance-dispatch-offers') ;
  END IF;
EXCEPTION WHEN others THEN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'advance-dispatch-offers',
      '* * * * *',
      'SELECT public.advance_expired_dispatch_offers()'
    );
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pg_cron no disponible';
END;
$$;

-- 5. Permisos
GRANT EXECUTE ON FUNCTION public.match_dispatch_doctors(UUID) TO service_role;

GRANT EXECUTE ON FUNCTION public.advance_expired_dispatch_offers() TO service_role;
