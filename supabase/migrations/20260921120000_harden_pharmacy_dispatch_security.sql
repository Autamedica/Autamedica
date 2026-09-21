-- Migration: 20260921120000_harden_pharmacy_dispatch_security.sql
-- Description: Endurecimiento clínico y de seguridad para Guardia On-Demand (P0-3, P0-4)
-- Resolves: P0-3 (Atomic claim concurrency & timeout verification) & P0-4 (RLS strict confinement for PHI)

-- 1. Endurecer Políticas RLS de pharmacy_dispatch_requests (Zero Anon Leaks)
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_select_all" ON public.pharmacy_dispatch_requests;
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_update_doctor" ON public.pharmacy_dispatch_requests;
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_insert_anon" ON public.pharmacy_dispatch_requests;

-- Solo permitir inserciones desde el kiosco/farmacia autenticado o vía service_role / edge function
CREATE POLICY "pharmacy_dispatch_requests_insert_safe"
    ON public.pharmacy_dispatch_requests FOR INSERT
    WITH CHECK (
        auth.role() = 'service_role' OR
        auth.uid() IS NOT NULL
    );

-- Lectura restringida: Médicos en guardia, médico asignado a la llamada o service_role
CREATE POLICY "pharmacy_dispatch_requests_select_confined"
    ON public.pharmacy_dispatch_requests FOR SELECT
    USING (
        auth.role() = 'service_role' OR
        assigned_doctor_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = pharmacy_dispatch_requests.assigned_doctor_id
              AND d.user_id = auth.uid()
        ) OR
        (
            status = 'searching' AND
            EXISTS (
                SELECT 1 FROM public.doctor_duty_status dds
                JOIN public.doctors d ON d.id = dds.doctor_id
                WHERE (dds.doctor_id = auth.uid() OR d.user_id = auth.uid())
                  AND dds.is_on_duty = true
            )
        )
    );

-- Actualización restringida: Exclusivamente médico asignado o service_role
CREATE POLICY "pharmacy_dispatch_requests_update_assigned_only"
    ON public.pharmacy_dispatch_requests FOR UPDATE
    USING (
        auth.role() = 'service_role' OR
        assigned_doctor_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = pharmacy_dispatch_requests.assigned_doctor_id
              AND d.user_id = auth.uid()
        )
    );

-- 2. Endurecer Políticas RLS de doctor_duty_status
DROP POLICY IF EXISTS "doctor_duty_status_read_all" ON public.doctor_duty_status;
DROP POLICY IF EXISTS "doctor_duty_status_manage_own" ON public.doctor_duty_status;

CREATE POLICY "doctor_duty_status_select_safe"
    ON public.doctor_duty_status FOR SELECT
    USING (
        auth.role() = 'service_role' OR
        doctor_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = doctor_duty_status.doctor_id
              AND d.user_id = auth.uid()
        )
    );

CREATE POLICY "doctor_duty_status_modify_own"
    ON public.doctor_duty_status FOR ALL
    USING (
        auth.role() = 'service_role' OR
        doctor_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = doctor_duty_status.doctor_id
              AND d.user_id = auth.uid()
        )
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        doctor_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = doctor_duty_status.doctor_id
              AND d.user_id = auth.uid()
        )
    );

-- 3. RPC Atómica Endurecida: public.claim_pharmacy_request_tier
-- Previene:
-- - Sobreasignación si el médico ya está en otra llamada (current_active_request_id IS NOT NULL)
-- - Reclamo de consultas vencidas (> 25 segundos)
-- - Incompatibilidad de tiers médicos
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
    v_resolved_doc_id UUID;
BEGIN
    -- Resolver ID canónico del doctor (por id o por user_id)
    SELECT id INTO v_resolved_doc_id
    FROM public.doctors
    WHERE id = p_doctor_id OR user_id = p_doctor_id
    LIMIT 1;

    IF v_resolved_doc_id IS NULL THEN
        v_resolved_doc_id := p_doctor_id;
    END IF;

    -- 1. Validar estado de guardia del médico y que no esté ocupado
    SELECT * INTO v_duty
    FROM public.doctor_duty_status
    WHERE (doctor_id = v_resolved_doc_id OR doctor_id = p_doctor_id)
      AND is_on_duty = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DOCTOR_NOT_ON_DUTY',
            'message', 'Debes activar tu estado En Servicio para tomar consultas.'
        );
    END IF;

    -- Prevenir sobreasignación (médico ya atendiendo)
    IF v_duty.current_active_request_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'DOCTOR_ALREADY_IN_CALL',
            'message', 'Ya tienes una consulta activa en curso. Finalízala antes de aceptar otra.'
        );
    END IF;

    -- 2. Bloquear la solicitud con SKIP LOCKED verificando SLA y vigencia (< 25 segundos)
    SELECT * INTO v_req
    FROM public.pharmacy_dispatch_requests
    WHERE id = p_request_id
      AND status = 'searching'
      AND (search_timeout_at IS NULL OR search_timeout_at > NOW())
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        -- Verificar si expiró para actualizar su estado de forma limpia
        UPDATE public.pharmacy_dispatch_requests
        SET status = 'expired'
        WHERE id = p_request_id
          AND status = 'searching'
          AND search_timeout_at <= NOW();

        RETURN jsonb_build_object(
            'success', false,
            'code', 'REQUEST_ALREADY_CLAIMED_OR_EXPIRED',
            'message', 'La consulta ya fue asignada a otro colega o expiró el SLA de 25 segundos.'
        );
    END IF;

    -- 3. Validar compatibilidad de Tier (si el médico definió tiers específicos)
    IF v_duty.active_tiers IS NOT NULL AND array_length(v_duty.active_tiers, 1) > 0 THEN
        IF NOT (v_req.tier_requested = ANY(v_duty.active_tiers) OR 'general' = ANY(v_duty.active_tiers)) THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'TIER_MISMATCH',
                'message', 'Esta consulta requiere una especialidad no configurada en tu guardia activa.'
            );
        END IF;
    END IF;

    -- 4. Adjudicación atómica al médico
    UPDATE public.pharmacy_dispatch_requests
    SET assigned_doctor_id = v_resolved_doc_id,
        status = 'matched',
        matched_at = NOW()
    WHERE id = p_request_id;

    -- 5. Marcar al médico ocupado en guardia
    UPDATE public.doctor_duty_status
    SET current_active_request_id = p_request_id,
        updated_at = NOW()
    WHERE doctor_id = v_duty.doctor_id;

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
