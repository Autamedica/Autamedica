-- 20260428190000_enable_doctor_chat.sql

-- 1. Modificar el check de roles para incluir a los médicos
ALTER TABLE public.conversation_events DROP CONSTRAINT IF EXISTS conversation_events_role_check;
ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_role_check 
    CHECK (role IN ('patient', 'assistant', 'system', 'doctor'));

-- 2. Asegurar que las sesiones puedan tener un doctor asignado (opcional, pero recomendado para filtrado)
ALTER TABLE public.conversation_sessions ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL;

-- 3. Actualizar Políticas de RLS para Médicos
-- Permitir que los médicos vean sesiones donde están involucrados
CREATE POLICY "Doctors can view their own conversation sessions"
    ON public.conversation_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.user_id = auth.uid() AND d.id = conversation_sessions.doctor_id
        )
    );

-- Permitir que los médicos vean eventos de sus sesiones
CREATE POLICY "Doctors can view their own conversation events"
    ON public.conversation_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_sessions s
            JOIN public.doctors d ON d.id = s.doctor_id
            WHERE s.id = conversation_events.session_id AND d.user_id = auth.uid()
        )
    );

-- Permitir que los médicos inserten mensajes
CREATE POLICY "Doctors can insert chat messages"
    ON public.conversation_events
    FOR INSERT
    WITH CHECK (
        role = 'doctor' AND
        EXISTS (
            SELECT 1 FROM public.conversation_sessions s
            JOIN public.doctors d ON d.id = s.doctor_id
            WHERE s.id = session_id AND d.user_id = auth.uid()
        )
    );
