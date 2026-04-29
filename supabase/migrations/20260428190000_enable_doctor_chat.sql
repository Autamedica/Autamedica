-- 20260428190000_enable_doctor_chat.sql

-- 1. Modificar el check de roles para incluir a los médicos
ALTER TABLE public.conversation_events DROP CONSTRAINT IF EXISTS conversation_events_role_check;
ALTER TABLE public.conversation_events ADD CONSTRAINT conversation_events_role_check 
    CHECK (role IN ('patient', 'assistant', 'system', 'doctor'));

-- 2. Asegurar que las sesiones puedan tener un doctor asignado (opcional, pero recomendado para filtrado)
ALTER TABLE public.conversation_sessions ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL;

-- 3. Helper de autorización: paciente dueño o médico activo del equipo de cuidado.
CREATE OR REPLACE FUNCTION public.can_access_p2p_chat_session(target_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversation_sessions s
        JOIN public.patients p ON p.id = s.patient_id
        LEFT JOIN public.doctors d ON d.id = s.doctor_id
        LEFT JOIN public.patient_care_team pct
            ON pct.patient_id = s.patient_id
            AND pct.doctor_id = s.doctor_id
            AND pct.active IS TRUE
        WHERE s.id = target_session_id
          AND s.channel = 'chat'
          AND (
            p.user_id = auth.uid()
            OR (d.user_id = auth.uid() AND pct.id IS NOT NULL)
          )
    );
$$;

-- 4. Actualizar Políticas de RLS para chat P2P.
DROP POLICY IF EXISTS "Patients can insert their own conversation sessions" ON public.conversation_sessions;
DROP POLICY IF EXISTS "Patients can insert assigned chat sessions" ON public.conversation_sessions;
CREATE POLICY "Patients can insert their own conversation sessions"
    ON public.conversation_sessions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = conversation_sessions.patient_id
              AND p.user_id = auth.uid()
        )
        AND (
            conversation_sessions.doctor_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.patient_care_team pct
                WHERE pct.patient_id = conversation_sessions.patient_id
                  AND pct.doctor_id = conversation_sessions.doctor_id
                  AND pct.active IS TRUE
            )
        )
    );

DROP POLICY IF EXISTS "Doctors can insert assigned chat sessions" ON public.conversation_sessions;
CREATE POLICY "Doctors can insert assigned chat sessions"
    ON public.conversation_sessions
    FOR INSERT
    WITH CHECK (
        channel = 'chat'
        AND EXISTS (
            SELECT 1
            FROM public.doctors d
            JOIN public.patient_care_team pct
                ON pct.doctor_id = d.id
                AND pct.patient_id = conversation_sessions.patient_id
                AND pct.active IS TRUE
            WHERE d.id = conversation_sessions.doctor_id
              AND d.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Patients can view their own conversation sessions" ON public.conversation_sessions;
CREATE POLICY "Patients can view their own conversation sessions"
    ON public.conversation_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = conversation_sessions.patient_id
              AND p.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Doctors can view their own conversation sessions" ON public.conversation_sessions;
CREATE POLICY "Doctors can view their own conversation sessions"
    ON public.conversation_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.doctors d
            JOIN public.patient_care_team pct
                ON pct.doctor_id = d.id
                AND pct.patient_id = conversation_sessions.patient_id
                AND pct.active IS TRUE
            WHERE d.user_id = auth.uid()
              AND d.id = conversation_sessions.doctor_id
        )
    );

DROP POLICY IF EXISTS "Patients can view their own conversation events" ON public.conversation_events;
CREATE POLICY "Patients can view their own conversation events"
    ON public.conversation_events
    FOR SELECT
    USING (public.can_access_p2p_chat_session(session_id));

DROP POLICY IF EXISTS "Doctors can view their own conversation events" ON public.conversation_events;
CREATE POLICY "Doctors can view their own conversation events"
    ON public.conversation_events
    FOR SELECT
    USING (public.can_access_p2p_chat_session(session_id));

DROP POLICY IF EXISTS "Server can insert conversation events" ON public.conversation_events;
DROP POLICY IF EXISTS "Patients can insert chat messages" ON public.conversation_events;
CREATE POLICY "Patients can insert chat messages"
    ON public.conversation_events
    FOR INSERT
    WITH CHECK (
        role = 'patient'
        AND public.can_access_p2p_chat_session(session_id)
        AND EXISTS (
            SELECT 1 FROM public.patients p
            WHERE p.id = conversation_events.patient_id
              AND p.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Doctors can insert chat messages" ON public.conversation_events;
CREATE POLICY "Doctors can insert chat messages"
    ON public.conversation_events
    FOR INSERT
    WITH CHECK (
        role = 'doctor'
        AND public.can_access_p2p_chat_session(session_id)
        AND EXISTS (
            SELECT 1
            FROM public.conversation_sessions s
            WHERE s.id = conversation_events.session_id
              AND s.patient_id = conversation_events.patient_id
        )
    );

DROP POLICY IF EXISTS "Service role can insert conversation events" ON public.conversation_events;
CREATE POLICY "Service role can insert conversation events"
    ON public.conversation_events
    FOR INSERT
    WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_chat_doctor
    ON public.conversation_sessions(patient_id, doctor_id, case_id, workflow_type, channel)
    WHERE status = 'active' AND channel = 'chat';

CREATE INDEX IF NOT EXISTS idx_conversation_events_session_created
    ON public.conversation_events(session_id, created_at);

CREATE OR REPLACE FUNCTION public.assert_p2p_chat_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.event_type <> 'message' OR NEW.channel <> 'text' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.conversation_sessions s
        WHERE s.id = NEW.session_id
          AND s.patient_id = NEW.patient_id
          AND s.channel = 'chat'
          AND s.status = 'active'
          AND s.doctor_id IS NOT NULL
          AND s.workflow_type = 'p2p_chat'
    ) THEN
        RETURN NEW;
    END IF;

    IF NEW.role NOT IN ('patient', 'doctor') THEN
        RAISE EXCEPTION 'invalid_p2p_chat_role';
    END IF;

    IF NEW.role = 'doctor' AND NOT EXISTS (
        SELECT 1
        FROM public.conversation_sessions s
        JOIN public.doctors d ON d.id = s.doctor_id
        WHERE s.id = NEW.session_id
          AND d.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'doctor_not_allowed_for_chat';
    END IF;

    IF NEW.role = 'patient' AND NOT EXISTS (
        SELECT 1
        FROM public.patients p
        WHERE p.id = NEW.patient_id
          AND p.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'patient_not_allowed_for_chat';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assert_p2p_chat_event ON public.conversation_events;
CREATE TRIGGER assert_p2p_chat_event
    BEFORE INSERT ON public.conversation_events
    FOR EACH ROW
    WHEN (NEW.event_type = 'message' AND NEW.channel = 'text')
    EXECUTE FUNCTION public.assert_p2p_chat_event();

CREATE OR REPLACE FUNCTION public.get_assigned_chat_doctor(target_patient_id uuid)
RETURNS TABLE (
    doctor_id uuid,
    first_name text,
    last_name text,
    specialty text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.id, pr.first_name, pr.last_name, d.specialty
    FROM public.patient_care_team pct
    JOIN public.patients pat ON pat.id = pct.patient_id
    JOIN public.doctors d ON d.id = pct.doctor_id
    LEFT JOIN public.profiles pr ON pr.user_id = d.user_id
    WHERE pct.patient_id = target_patient_id
      AND pct.active IS TRUE
      AND pat.user_id = auth.uid()
    ORDER BY
      CASE pct.role WHEN 'primary' THEN 0 ELSE 1 END,
      pct.assigned_date DESC NULLS LAST,
      pct.created_at DESC NULLS LAST
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_p2p_chat_session(
    target_patient_id uuid,
    target_doctor_id uuid,
    target_case_id text DEFAULT 'general_followup'
)
RETURNS public.conversation_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    chat_session public.conversation_sessions;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.patients p
        LEFT JOIN public.doctors d ON d.id = target_doctor_id
        JOIN public.patient_care_team pct
            ON pct.patient_id = target_patient_id
            AND pct.doctor_id = target_doctor_id
            AND pct.active IS TRUE
        WHERE p.id = target_patient_id
          AND (p.user_id = auth.uid() OR d.user_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'chat_participants_not_allowed';
    END IF;

    SELECT *
    INTO chat_session
    FROM public.conversation_sessions
    WHERE patient_id = target_patient_id
      AND doctor_id = target_doctor_id
      AND case_id = target_case_id
      AND workflow_type = 'p2p_chat'
      AND channel = 'chat'
      AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1;

    IF chat_session.id IS NOT NULL THEN
        RETURN chat_session;
    END IF;

    INSERT INTO public.conversation_sessions (
        patient_id,
        doctor_id,
        case_id,
        status,
        channel,
        workflow_type
    )
    VALUES (
        target_patient_id,
        target_doctor_id,
        target_case_id,
        'active',
        'chat',
        'p2p_chat'
    )
    RETURNING * INTO chat_session;

    RETURN chat_session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_assigned_chat_doctor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_p2p_chat_session(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_p2p_chat_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_p2p_chat_event() TO authenticated;
