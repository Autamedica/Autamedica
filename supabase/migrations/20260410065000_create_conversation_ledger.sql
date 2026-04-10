-- 20260410065000_create_conversation_ledger.sql

CREATE TABLE IF NOT EXISTS public.conversation_sessions (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    case_id text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('voice', 'chat')),
    workflow_type text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'failed')),
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    CONSTRAINT pk_conversation_sessions PRIMARY KEY (id)
);

-- For idempotency as suggested: one active session per patient/case/workflow/channel
CREATE UNIQUE INDEX idx_conversation_sessions_idempotency 
    ON public.conversation_sessions(patient_id, case_id, workflow_type, channel)
    WHERE status = 'active';

CREATE INDEX idx_conversation_sessions_status ON public.conversation_sessions(status);

ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can view their own conversation sessions"
    ON public.conversation_sessions
    FOR SELECT
    USING (auth.uid() = patient_id);

CREATE POLICY "Patients can insert their own conversation sessions"
    ON public.conversation_sessions
    FOR INSERT
    WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Patients can update their own conversation sessions"
    ON public.conversation_sessions
    FOR UPDATE
    USING (auth.uid() = patient_id);

CREATE TABLE IF NOT EXISTS public.conversation_events (
    id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
    session_id uuid NOT NULL REFERENCES public.conversation_sessions(id) ON DELETE CASCADE,
    case_id text NOT NULL,
    patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
    sequence_number serial NOT NULL,
    role text NOT NULL CHECK (role IN ('patient', 'assistant', 'system')),
    event_type text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('voice', 'text')),
    segment text,
    raw_text text NOT NULL,
    normalized_text text,
    extracted_fields jsonb,
    planner_output jsonb,
    prompt_snapshot_text text,
    model_name text,
    model_version text,
    extraction_confidence text,
    latency_ms integer,
    error_code text,
    error_message text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_conversation_events PRIMARY KEY (id)
);

CREATE UNIQUE INDEX idx_conversation_events_sequence ON public.conversation_events(session_id, sequence_number);
CREATE INDEX idx_conversation_events_patient_case ON public.conversation_events(patient_id, case_id);
CREATE INDEX idx_conversation_events_created_at ON public.conversation_events(created_at);

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can view their own conversation events"
    ON public.conversation_events
    FOR SELECT
    USING (auth.uid() = patient_id);

CREATE POLICY "Server can insert conversation events"
    ON public.conversation_events
    FOR INSERT
    WITH CHECK (true); -- Real validation will happen via Server-side constraints/APIs

