-- =====================================================================
-- Migration: 20260924010000_doctor_presence_heartbeat_and_rls_hardening.sql
-- Description:
-- 1. RPC doctor_heartbeat: actualiza presencia con TTL en doctor_duty_status
--    y doctor_on_duty_sessions.
-- 2. Actualizar get_duty_doctors_summary y get_active_on_duty_doctors
--    reincorporando el guardrail de presencia viva (last_heartbeat_at > now() - 90s).
-- 3. Endurecer RLS en la tabla legacy pharmacy_consultation_requests:
--    - Eliminar política abierta allow_select_own_pharmacy_request
--    - SELECT confinado a service_role, médico asignado, o médicos en guardia
--      activa si el request está 'pending'.
--    - UPDATE endurecido para prevenir cancelaciones masivas no autorizadas.
--    - RPC segura cancel_pharmacy_consultation_request con ID específico.
-- =====================================================================

-- 1. Función RPC: public.doctor_heartbeat
CREATE OR REPLACE FUNCTION public.doctor_heartbeat(p_doctor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_doctor_id UUID;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1.1 Resuelve el doctor canónico (id = p_doctor_id OR user_id = p_doctor_id)
    SELECT id INTO v_doctor_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_doctor_id IS NULL THEN
        v_doctor_id := p_doctor_id;
    END IF;

    -- 1.2 Actualiza doctor_duty_status si está en guardia
    UPDATE public.doctor_duty_status
    SET last_heartbeat_at = v_now,
        updated_at = v_now
    WHERE doctor_id = v_doctor_id
      AND is_on_duty = true;

    -- 1.3 Actualiza doctor_on_duty_sessions activas
    UPDATE public.doctor_on_duty_sessions
    SET last_heartbeat_at = v_now
    WHERE doctor_id = v_doctor_id
      AND status = 'active';

    -- 1.4 Retorna resultado exitoso
    RETURN jsonb_build_object(
        'success', true,
        'timestamp', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_heartbeat(UUID) TO authenticated, service_role, anon;

-- 2. Guardrail de Presencia en Resumen y Búsqueda de Guardia

-- 2.1 get_duty_doctors_summary (Presencia obligatoria < 90 segundos)
CREATE OR REPLACE FUNCTION public.get_duty_doctors_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH unnested_tiers AS (
        SELECT unnest(active_tiers) AS tier, current_active_request_id
        FROM public.doctor_duty_status
        WHERE is_on_duty = true
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
$$;

GRANT EXECUTE ON FUNCTION public.get_duty_doctors_summary() TO authenticated, anon, service_role;

-- 2.2 get_active_on_duty_doctors (Presencia obligatoria < 90 segundos)
CREATE OR REPLACE FUNCTION public.get_active_on_duty_doctors()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
      AND dds.last_heartbeat_at > (NOW() - INTERVAL '90 seconds');

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_on_duty_doctors() TO authenticated, anon, service_role;

-- 3. Endurecimiento de RLS en pharmacy_consultation_requests

-- 3.1 Eliminar política abierta previa
DROP POLICY IF EXISTS "allow_select_own_pharmacy_request" ON public.pharmacy_consultation_requests;
DROP POLICY IF EXISTS "pharmacy_consultation_requests_select_confined" ON public.pharmacy_consultation_requests;

-- 3.2 Política de SELECT confinada
-- Solo service_role, el médico asignado a la llamada, o médicos con guardia activa si el request está 'pending'
CREATE POLICY "pharmacy_consultation_requests_select_confined"
  ON public.pharmacy_consultation_requests
  FOR SELECT
  TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR doctor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = pharmacy_consultation_requests.doctor_id
        AND d.user_id = auth.uid()
    )
    OR (
      status = 'pending'
      AND EXISTS (
        SELECT 1 FROM public.doctor_duty_status dds
        JOIN public.doctors d ON d.id = dds.doctor_id
        WHERE (dds.doctor_id = auth.uid() OR d.user_id = auth.uid())
          AND dds.is_on_duty = true
          AND dds.last_heartbeat_at > (NOW() - INTERVAL '90 seconds')
      )
    )
  );

-- 3.3 Endurecer política de UPDATE para cancelaciones y asignación
DROP POLICY IF EXISTS "doctors_update_pharmacy_requests" ON public.pharmacy_consultation_requests;
DROP POLICY IF EXISTS "pharmacy_consultation_requests_update_confined" ON public.pharmacy_consultation_requests;

CREATE POLICY "pharmacy_consultation_requests_update_confined"
  ON public.pharmacy_consultation_requests
  FOR UPDATE
  TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR doctor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = pharmacy_consultation_requests.doctor_id
        AND d.user_id = auth.uid()
    )
    OR (
      -- Médicos en guardia activa pueden tomar (claim) un request pendiente asignándose a sí mismos
      status = 'pending'
      AND EXISTS (
        SELECT 1 FROM public.doctor_duty_status dds
        JOIN public.doctors d ON d.id = dds.doctor_id
        WHERE (dds.doctor_id = auth.uid() OR d.user_id = auth.uid())
          AND dds.is_on_duty = true
          AND dds.last_heartbeat_at > (NOW() - INTERVAL '90 seconds')
      )
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (
      -- Solo el médico asignado puede actualizar su consulta (e.g. status in_call, completed, cancelled)
      EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = pharmacy_consultation_requests.doctor_id
          AND d.user_id = auth.uid()
      )
    )
  );

-- 3.4 RPC para cancelación segura con ID específico de solicitud
CREATE OR REPLACE FUNCTION public.cancel_pharmacy_consultation_request(
    p_request_id UUID,
    p_reason TEXT DEFAULT 'cancelled_by_user'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE public.pharmacy_consultation_requests
    SET status = 'cancelled',
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{cancellation_reason}', to_jsonb(p_reason))
    WHERE id = p_request_id
      AND status = 'pending';

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'request_not_found_or_not_pending');
    END IF;

    RETURN jsonb_build_object('success', true, 'request_id', p_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_pharmacy_consultation_request(UUID, TEXT) TO authenticated, service_role, anon;
