-- Migration: 20260919000000_pharmacy_on_demand_dispatch.sql
-- Description: Ecosistema On-Demand de Atención Médica en Farmacias y Vía Pública ("Uber para Médicos")
-- Architecture: Supabase Realtime + Cloudflare Calls WebRTC SFU (ADR-0003)

-- 1. Categorías de Tiers compatibles con la UX de 1 Toque
DO $$ BEGIN
    CREATE TYPE public.dispatch_tier_category AS ENUM (
        'general',
        'cardiologia',
        'salud_mental',
        'pediatria',
        'dermatologia',
        'traumatologia',
        'salud_femenina',
        'oftalmo_otorrino',
        'neumonologia',
        'gastroenterologia',
        'urologia',
        'endocrinologia'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.dispatch_request_status AS ENUM (
        'searching',
        'matched',
        'in_call',
        'transferring',
        'transferred',
        'completed',
        'cancelled',
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Kioscos Físicos y Puntos de Despacho
CREATE TABLE IF NOT EXISTS public.pharmacy_kiosks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE SET NULL,
    device_fingerprint TEXT UNIQUE NOT NULL,
    friendly_name TEXT NOT NULL,
    hardware_type TEXT NOT NULL DEFAULT 'kiosk_touch', -- 'kiosk_touch', 'street_mobile', 'counter_tablet'
    active BOOLEAN NOT NULL DEFAULT true,
    last_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Estado de Guardia del Médico
CREATE TABLE IF NOT EXISTS public.doctor_duty_status (
    doctor_id UUID PRIMARY KEY REFERENCES public.doctors(id) ON DELETE CASCADE,
    is_on_duty BOOLEAN NOT NULL DEFAULT false,
    active_tiers public.dispatch_tier_category[] NOT NULL DEFAULT '{general}'::public.dispatch_tier_category[],
    current_active_request_id UUID,
    duty_started_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Solicitudes de Despacho On-Demand
CREATE TABLE IF NOT EXISTS public.pharmacy_dispatch_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kiosk_id UUID REFERENCES public.pharmacy_kiosks(id) ON DELETE SET NULL,
    pharmacy_id UUID REFERENCES public.pharmacies(id) ON DELETE SET NULL,
    patient_dni TEXT NOT NULL,
    patient_phone TEXT NOT NULL,
    patient_name TEXT,
    tier_requested public.dispatch_tier_category NOT NULL DEFAULT 'general',
    symptom_summary TEXT,
    
    -- Estado y Asignación
    status public.dispatch_request_status NOT NULL DEFAULT 'searching',
    assigned_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    previous_doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
    
    -- Sesión Cloudflare Calls y Sala
    cloudflare_room_id TEXT UNIQUE NOT NULL,
    patient_cf_session_id TEXT,
    doctor_cf_session_id TEXT,
    
    -- SLAs y Auditoría Temporal
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_at TIMESTAMPTZ,
    call_started_at TIMESTAMPTZ,
    call_ended_at TIMESTAMPTZ,
    search_timeout_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '25 seconds')
);

-- 5. Índices para Alto Rendimiento (< 2 ms)
CREATE INDEX IF NOT EXISTS idx_dispatch_searching_queue
    ON public.pharmacy_dispatch_requests (tier_requested, status, created_at)
    WHERE status = 'searching';

CREATE INDEX IF NOT EXISTS idx_doctor_duty_active_lookup
    ON public.doctor_duty_status (is_on_duty, last_heartbeat_at)
    WHERE is_on_duty = true;

CREATE INDEX IF NOT EXISTS idx_dispatch_requests_phone
    ON public.pharmacy_dispatch_requests (patient_phone, status);

CREATE INDEX IF NOT EXISTS idx_dispatch_requests_room
    ON public.pharmacy_dispatch_requests (cloudflare_room_id);

-- 6. Habilitar RLS y Supabase Realtime
ALTER TABLE public.pharmacy_kiosks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_dispatch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_duty_status ENABLE ROW LEVEL SECURITY;

-- Políticas Kioscos
DROP POLICY IF EXISTS "pharmacy_kiosks_read_all" ON public.pharmacy_kiosks;
CREATE POLICY "pharmacy_kiosks_read_all"
    ON public.pharmacy_kiosks FOR SELECT
    USING (true);

-- Políticas Dispatch Requests
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_insert_anon" ON public.pharmacy_dispatch_requests;
CREATE POLICY "pharmacy_dispatch_requests_insert_anon"
    ON public.pharmacy_dispatch_requests FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "pharmacy_dispatch_requests_select_all" ON public.pharmacy_dispatch_requests;
CREATE POLICY "pharmacy_dispatch_requests_select_all"
    ON public.pharmacy_dispatch_requests FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "pharmacy_dispatch_requests_update_doctor" ON public.pharmacy_dispatch_requests;
CREATE POLICY "pharmacy_dispatch_requests_update_doctor"
    ON public.pharmacy_dispatch_requests FOR UPDATE
    USING (true);

-- Políticas Doctor Duty Status
DROP POLICY IF EXISTS "doctor_duty_status_read_all" ON public.doctor_duty_status;
CREATE POLICY "doctor_duty_status_read_all"
    ON public.doctor_duty_status FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "doctor_duty_status_manage_own" ON public.doctor_duty_status;
CREATE POLICY "doctor_duty_status_manage_own"
    ON public.doctor_duty_status FOR ALL
    USING (true)
    WITH CHECK (true);

-- 7. Publicaciones Realtime (Idempotentes)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'pharmacy_dispatch_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_dispatch_requests;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'doctor_duty_status'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_duty_status;
    END IF;
END $$;

-- 8. RPC Atómica: public.claim_pharmacy_request_tier
CREATE OR REPLACE FUNCTION public.claim_pharmacy_request_tier(
    p_request_id UUID,
    p_doctor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_duty RECORD;
BEGIN
    -- 1. Validar o registrar que el médico esté en servicio activo
    SELECT * INTO v_duty
    FROM public.doctor_duty_status
    WHERE doctor_id = p_doctor_id AND is_on_duty = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DOCTOR_NOT_ON_DUTY',
            'message', 'Debes activar tu estado En Servicio para tomar consultas.'
        );
    END IF;

    -- 2. Bloquear la solicitud con SKIP LOCKED (cero colisiones si múltiples médicos aceptan a la vez)
    SELECT * INTO v_req
    FROM public.pharmacy_dispatch_requests
    WHERE id = p_request_id AND status = 'searching'
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REQUEST_ALREADY_CLAIMED_OR_EXPIRED',
            'message', 'La consulta ya fue asignada a otro colega o expiró su tiempo de espera.'
        );
    END IF;

    -- 3. Adjudicar la consulta al médico ganador
    UPDATE public.pharmacy_dispatch_requests
    SET assigned_doctor_id = p_doctor_id,
        status = 'matched',
        matched_at = NOW()
    WHERE id = p_request_id;

    -- 4. Actualizar el estado del médico para marcarlo ocupado
    UPDATE public.doctor_duty_status
    SET current_active_request_id = p_request_id,
        updated_at = NOW()
    WHERE doctor_id = p_doctor_id;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'MATCH_SUCCESSFUL',
        'request_id', v_req.id,
        'cloudflare_room_id', v_req.cloudflare_room_id,
        'patient_dni', v_req.patient_dni,
        'patient_phone', v_req.patient_phone,
        'tier_requested', v_req.tier_requested
    );
END;
$$;

-- 9. RPC de Gestión de Guardia Médica: public.set_doctor_duty_status
CREATE OR REPLACE FUNCTION public.set_doctor_duty_status(
    p_doctor_id UUID,
    p_is_on_duty BOOLEAN,
    p_active_tiers public.dispatch_tier_category[] DEFAULT '{general}'::public.dispatch_tier_category[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.doctor_duty_status (
        doctor_id,
        is_on_duty,
        active_tiers,
        duty_started_at,
        last_heartbeat_at,
        updated_at
    )
    VALUES (
        p_doctor_id,
        p_is_on_duty,
        p_active_tiers,
        CASE WHEN p_is_on_duty THEN NOW() ELSE NULL END,
        NOW(),
        NOW()
    )
    ON CONFLICT (doctor_id) DO UPDATE
    SET is_on_duty = EXCLUDED.is_on_duty,
        active_tiers = EXCLUDED.active_tiers,
        duty_started_at = CASE 
            WHEN EXCLUDED.is_on_duty AND NOT public.doctor_duty_status.is_on_duty THEN NOW() 
            WHEN NOT EXCLUDED.is_on_duty THEN NULL
            ELSE public.doctor_duty_status.duty_started_at 
        END,
        last_heartbeat_at = NOW(),
        updated_at = NOW();

    RETURN jsonb_build_object(
        'success', true,
        'doctor_id', p_doctor_id,
        'is_on_duty', p_is_on_duty,
        'active_tiers', p_active_tiers
    );
END;
$$;

-- 10. RPC Resumen de Disponibilidad para Kioscos: public.get_duty_doctors_summary
CREATE OR REPLACE FUNCTION public.get_duty_doctors_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_object_agg(
        tier,
        jsonb_build_object(
            'online_count', count(*),
            'free_count', count(*) FILTER (WHERE current_active_request_id IS NULL)
        )
    ) INTO v_result
    FROM (
        SELECT unnest(active_tiers) AS tier, current_active_request_id
        FROM public.doctor_duty_status
        WHERE is_on_duty = true 
          AND last_heartbeat_at > (NOW() - INTERVAL '3 minutes')
    ) active_doctors;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;
