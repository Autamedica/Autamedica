-- Migration: 20260921203000_pharmacy_dispatch_patient_ownership.sql
-- Description: Propiedad del paciente sobre su solicitud on-demand (requested_by_user_id + RLS confinada)
-- Resolves:
--   - El paciente Android (PharmacyIntake) usa pharmacy_dispatch_requests (no la tabla legacy).
--   - Cierra el hueco de RLS que dejaba pharmacy_dispatch_requests abierta (INSERT/UPDATE/SELECT con USING true),
--     permitiendo leer PHI de cualquier solicitud sin autenticación.
--   - Sustituye/completa la harden 20260921120000 con la autorización del dueño (requested_by_user_id),
--     necesaria para que la edge cloudflare-calls autorice al paciente por identidad y no por fallback.

-- 1. Columna de autoría del paciente (user_id de auth.users que creó la solicitud)
ALTER TABLE public.pharmacy_dispatch_requests
    ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_requests_requester
    ON public.pharmacy_dispatch_requests (requested_by_user_id)
    WHERE requested_by_user_id IS NOT NULL;

-- 2. Reemplazo completo de políticas (viejas abiertas + harden sin soporte de dueño)
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_insert_anon" ON public.pharmacy_dispatch_requests;
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_select_all" ON public.pharmacy_dispatch_requests;
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_update_doctor" ON public.pharmacy_dispatch_requests;
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_insert_safe" ON public.pharmacy_dispatch_requests;
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_select_confined" ON public.pharmacy_dispatch_requests;
DROP POLICY IF EXISTS "pharmacy_dispatch_requests_update_assigned_only" ON public.pharmacy_dispatch_requests;

-- INSERT: solo service_role o el usuario autenticado dueño de la solicitud
CREATE POLICY "pharmacy_dispatch_requests_insert_owner"
    ON public.pharmacy_dispatch_requests FOR INSERT
    WITH CHECK (
        auth.role() = 'service_role' OR
        (auth.uid() IS NOT NULL AND requested_by_user_id = auth.uid())
    );

-- SELECT: service_role, dueño de la solicitud, médico asignado, médico en guardia con solicitudes searching.
-- Cero lecturas anónimas de PHI.
CREATE POLICY "pharmacy_dispatch_requests_select_confined"
    ON public.pharmacy_dispatch_requests FOR SELECT
    USING (
        auth.role() = 'service_role' OR
        requested_by_user_id = auth.uid() OR
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

-- UPDATE: médico asignado, service_role, o el dueño cancelando su solicitud searching -> cancelled.
CREATE POLICY "pharmacy_dispatch_requests_update_assigned_or_owner"
    ON public.pharmacy_dispatch_requests FOR UPDATE
    USING (
        auth.role() = 'service_role' OR
        assigned_doctor_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = pharmacy_dispatch_requests.assigned_doctor_id
              AND d.user_id = auth.uid()
        ) OR
        (requested_by_user_id = auth.uid() AND status = 'searching')
    )
    WITH CHECK (
        auth.role() = 'service_role' OR
        assigned_doctor_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = pharmacy_dispatch_requests.assigned_doctor_id
              AND d.user_id = auth.uid()
        ) OR
        (requested_by_user_id = auth.uid() AND status = 'cancelled')
    );