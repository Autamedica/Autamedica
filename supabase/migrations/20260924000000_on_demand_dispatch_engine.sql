-- =====================================================================
-- Migration: 20260924000000_on_demand_dispatch_engine.sql
-- Description: Motor de despacho OnDemand para pharmacy consultations
-- 1. dispatch_offers: ofertas temporales a médicos (30s timeout)
-- 2. Columnas en pharmacy_consultation_requests para especialidad/precio
-- 3. Funciones RPC: match_dispatch_doctors, claim_dispatch_offer
-- 4. Trigger para actualizar last_heartbeat en doctor_on_duty_sessions
-- 5. Tabla ondemand_pricing con precios y tiers
-- =====================================================================

-- 1. Nueva tabla: dispatch_offers (ofertas a médicos con timeout 30s)
CREATE TABLE IF NOT EXISTS public.dispatch_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_request_id UUID NOT NULL REFERENCES public.pharmacy_consultation_requests(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 seconds',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  accepted_at TIMESTAMPTZ,
  price_brl NUMERIC(6,2),
  UNIQUE (dispatch_request_id, doctor_id)
);

ALTER TABLE public.dispatch_offers
  ADD COLUMN IF NOT EXISTS price_brl NUMERIC(6,2);

CREATE INDEX IF NOT EXISTS idx_dispatch_offers_dispatch 
  ON public.dispatch_offers(dispatch_request_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_offers_doctor 
  ON public.dispatch_offers(doctor_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_offers_expires 
  ON public.dispatch_offers(expires_at);

ALTER TABLE public.dispatch_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatch_offers_doctor_read" ON public.dispatch_offers;
CREATE POLICY "dispatch_offers_doctor_read"
  ON public.dispatch_offers FOR SELECT
  TO authenticated, service_role
  USING (
    auth.role() = 'service_role' OR
    doctor_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = dispatch_offers.doctor_id
        AND d.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "dispatch_offers_service_role_all" ON public.dispatch_offers;
CREATE POLICY "dispatch_offers_service_role_all"
  ON public.dispatch_offers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.dispatch_offers IS 
  'Ofertas temporales a médicos para despacho OnDemand. Cada oferta expira a los 30s. Primera aceptación gana.';

-- 2. Columnas adicionales en pharmacy_consultation_requests para el motor de despacho
ALTER TABLE public.pharmacy_consultation_requests
  ADD COLUMN IF NOT EXISTS requested_specialty TEXT;

ALTER TABLE public.pharmacy_consultation_requests
  ADD COLUMN IF NOT EXISTS price_brl NUMERIC(6,2);

ALTER TABLE public.pharmacy_consultation_requests
  ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ;

-- 3. Función RPC: match_dispatch_doctors
-- Busca médicos on-duty con heartbeat reciente y crea ofertas
CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_specialty TEXT := (SELECT requested_specialty FROM public.pharmacy_consultation_requests WHERE id = p_dispatch_id);
  v_tier TEXT := CASE 
    WHEN v_specialty ILIKE '%dermat%' THEN 'specialist'
    WHEN v_specialty ILIKE '%psiquiat%' THEN 'psychiatry'  
    ELSE 'basic' -- clínica general
  END;
  v_price NUMERIC(6,2) := CASE 
    WHEN v_tier = 'specialist' THEN 159.90
    WHEN v_tier = 'psychiatry' THEN 179.90
    ELSE 69.90
  END;
  v_result JSONB;
BEGIN
  -- Limpiar ofertas previas expiradas para este dispatch
  DELETE FROM public.dispatch_offers WHERE dispatch_request_id = p_dispatch_id AND status = 'expired';
  
  -- Buscar médicos on-duty con heartbeat reciente (> now() - 90s)
  -- y que no tengan ofertas activas pending para este dispatch
  WITH inserted AS (
    INSERT INTO public.dispatch_offers (dispatch_request_id, doctor_id, offered_at, expires_at, status, price_brl)
    SELECT 
      p_dispatch_id,
      d.id,
      now(),
      now() + interval '30 seconds',
      'pending',
      v_price
    FROM public.doctors d
    JOIN public.doctor_duty_status dds ON dds.doctor_id = d.id
    WHERE (d.on_duty_pharmacy = true OR dds.is_on_duty = true)
      AND dds.last_heartbeat_at > now() - interval '90 seconds'
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers doe
        WHERE doe.dispatch_request_id = p_dispatch_id
          AND doe.doctor_id = d.id
          AND doe.status = 'pending'
      )
    RETURNING id, doctor_id, offered_at, expires_at, status, price_brl
  )
  SELECT jsonb_build_object(
    'offers',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'doctor_id', doctor_id::text,
          'offered_at', offered_at,
          'expires_at', expires_at,
          'status', status,
          'price_brl', price_brl
        )
      ),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM inserted;
  
  -- Si no hay médicos disponibles, retornar JSON vacío indicando que hay que reintentar después
  IF v_result IS NULL OR (v_result->'offers') IS NULL OR jsonb_array_length(v_result->'offers') = 0 THEN
    RETURN '{}'::jsonb;
  END IF;
  
  RETURN v_result;
END;
$$;

-- 4. Función RPC: claim_dispatch_offer (atómico: primero acepta, luego crea call/guest/assign)
CREATE OR REPLACE FUNCTION public.claim_dispatch_offer(p_offer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offer public.dispatch_offers%rowtype;
  v_call public.calls%rowtype;
  v_invite public.call_guest_invites%rowtype;
  v_random_hex TEXT := substring(md5(random()::text) from 1 for 8);
  v_room_id TEXT := 'room_pharm_' || floor(extract(epoch from now()))::bigint::text || '_' || substring(md5(random()::text) from 1 for 8);
  v_patient_name TEXT;
  v_patient_dni TEXT;
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
  
  IF v_offer.expires_at < now() THEN
    UPDATE public.dispatch_offers SET status = 'expired' WHERE id = p_offer_id;
    RETURN jsonb_build_object('success', false, 'error', 'offer_expired');
  END IF;
  
  -- 2. Marcar oferta como aceptada
  UPDATE public.dispatch_offers 
  SET status = 'accepted', accepted_at = now()
  WHERE id = p_offer_id;

  -- Expirar otras ofertas concurrentes para este request
  UPDATE public.dispatch_offers
  SET status = 'expired'
  WHERE dispatch_request_id = v_offer.dispatch_request_id
    AND id <> p_offer_id
    AND status = 'pending';
  
  -- Obtener datos del paciente de la solicitud
  SELECT patient_name, patient_dni INTO v_patient_name, v_patient_dni
  FROM public.pharmacy_consultation_requests
  WHERE id = v_offer.dispatch_request_id;

  -- 3. Crear llamada en calls
  INSERT INTO public.calls (doctor_id, patient_id, room_id, status)
  VALUES (v_offer.doctor_id, NULL, v_room_id, 'requested')
  RETURNING * INTO v_call;
   
  -- 4. Crear invitación para invitado paciente (24h expiration)
  INSERT INTO public.call_guest_invites (call_id, room_id, guest_name, expires_at)
  VALUES (v_call.id, v_room_id, COALESCE(v_patient_name, 'Paciente'), now() + interval '24 hours')
  RETURNING * INTO v_invite;
   
  -- 5. Actualizar request atómicamente
  UPDATE public.pharmacy_consultation_requests
  SET 
    doctor_id = v_offer.doctor_id,
    call_id = v_call.id,
    room_id = v_room_id,
    guest_invite_id = v_invite.id,
    status = 'assigned',
    assigned_at = now(),
    price_brl = v_offer.price_brl
  WHERE id = v_offer.dispatch_request_id;
   
  -- 6. Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'requestId', v_offer.dispatch_request_id::text,
    'callId', v_call.id::text,
    'roomId', v_room_id,
    'guestInviteId', v_invite.id::text,
    'doctorId', v_offer.doctor_id::text,
    'patientName', v_patient_name,
    'patientDni', v_patient_dni,
    'priceBrl', v_offer.price_brl,
    'assignedAt', now()
  );
   
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_dispatch_doctors(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_dispatch_offer(UUID) TO authenticated, service_role;

-- 5. Trigger para actualizar last_heartbeat en doctor_on_duty_sessions
CREATE OR REPLACE FUNCTION public.update_doctor_heartbeat()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.on_duty_pharmacy IS DISTINCT FROM OLD.on_duty_pharmacy THEN
    IF NEW.on_duty_pharmacy = true THEN
      UPDATE public.doctor_on_duty_sessions 
      SET last_heartbeat_at = now(), 
          status = 'active',
          started_at = COALESCE(NEW.on_duty_since, now()),
          ended_at = NULL
      WHERE doctor_id = NEW.id AND status = 'active';
      
      IF NOT FOUND THEN
        INSERT INTO public.doctor_on_duty_sessions (doctor_id, status, started_at, last_heartbeat_at)
        VALUES (NEW.id, 'active', COALESCE(NEW.on_duty_since, now()), now());
      END IF;
    ELSE
      UPDATE public.doctor_on_duty_sessions
      SET status = 'ended',
          ended_at = now()
      WHERE doctor_id = NEW.id AND status = 'active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_doctor_heartbeat ON public.doctors;
CREATE TRIGGER tr_update_doctor_heartbeat
AFTER UPDATE ON public.doctors
FOR EACH ROW EXECUTE FUNCTION public.update_doctor_heartbeat();

-- 6. Tabla y datos de precios iniciales en ondemand_pricing
CREATE TABLE IF NOT EXISTS public.ondemand_pricing (
  tier TEXT PRIMARY KEY,
  price_brl NUMERIC(6,2) NOT NULL,
  specialties TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  min_consult_time INT NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ondemand_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ondemand_pricing_read_all" ON public.ondemand_pricing;
CREATE POLICY "ondemand_pricing_read_all"
  ON public.ondemand_pricing FOR SELECT
  TO authenticated, anon, service_role
  USING (true);

INSERT INTO public.ondemand_pricing (tier, price_brl, specialties, min_consult_time)
VALUES 
  ('basic', 69.90, ARRAY['clinica_general']::text[], 20),
  ('specialist', 159.90, ARRAY['dermatologia','reumatologia']::text[], 30),
  ('psychiatry', 179.90, ARRAY['psiquiatria']::text[], 45)
ON CONFLICT (tier) DO NOTHING;
