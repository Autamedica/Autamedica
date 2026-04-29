-- Align doctor chat authorization with the doctor portal patient list.
-- Doctors can open a P2P channel when the patient is in their care team or has
-- an appointment assigned to them.

CREATE OR REPLACE FUNCTION public.doctor_can_chat_with_patient(
    target_doctor_id uuid,
    target_patient_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.patient_care_team pct
        WHERE pct.doctor_id = target_doctor_id
          AND pct.patient_id = target_patient_id
          AND pct.active IS TRUE
    )
    OR EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.doctor_id = target_doctor_id
          AND a.patient_id = target_patient_id
    );
$$;

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
        WHERE s.id = target_session_id
          AND s.channel = 'chat'
          AND (
            p.user_id = auth.uid()
            OR (
                d.user_id = auth.uid()
                AND public.doctor_can_chat_with_patient(s.doctor_id, s.patient_id)
            )
          )
    );
$$;

DROP POLICY IF EXISTS "Patients can insert their own conversation sessions" ON public.conversation_sessions;
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
            OR public.doctor_can_chat_with_patient(
                conversation_sessions.doctor_id,
                conversation_sessions.patient_id
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
            WHERE d.id = conversation_sessions.doctor_id
              AND d.user_id = auth.uid()
        )
        AND public.doctor_can_chat_with_patient(
            conversation_sessions.doctor_id,
            conversation_sessions.patient_id
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
            WHERE d.user_id = auth.uid()
              AND d.id = conversation_sessions.doctor_id
        )
        AND public.doctor_can_chat_with_patient(
            conversation_sessions.doctor_id,
            conversation_sessions.patient_id
        )
    );

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
        WHERE p.id = target_patient_id
          AND (
            p.user_id = auth.uid()
            OR (
                d.user_id = auth.uid()
                AND public.doctor_can_chat_with_patient(target_doctor_id, target_patient_id)
            )
          )
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

GRANT EXECUTE ON FUNCTION public.doctor_can_chat_with_patient(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_p2p_chat_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_p2p_chat_session(uuid, uuid, text) TO authenticated;
