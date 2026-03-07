-- Clinical AI Pipeline Core
-- Author: Codex
-- Context: Deterministic pipeline for WhatsApp/PWA clinical audio processing

-- ============================================================================
-- 1. HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_clinical_ai_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_doctor_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id
  FROM public.doctors d
  WHERE d.user_id = auth.uid()
    AND COALESCE(d.active, true) = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_doctor_profile_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_doctor_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_doctor_profile_id() TO service_role;

-- ============================================================================
-- 2. TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clinical_ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_profile_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  patient_profile_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  telemedicine_session_id uuid REFERENCES public.telemedicine_sessions(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'pwa', 'internal_upload')),
  channel_thread_ref text,
  provider_name text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (
    status IN (
      'OPEN',
      'WAITING_FOR_MORE_AUDIO',
      'SEALED',
      'PROCESSING',
      'READY_TO_DELIVER',
      'DELIVERED',
      'FAILED',
      'PURGED'
    )
  ),
  language_code text,
  specialty_hint text,
  session_opened_at timestamptz NOT NULL DEFAULT now(),
  session_sealed_at timestamptz,
  processing_started_at timestamptz,
  delivery_completed_at timestamptz,
  retention_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT clinical_ai_sessions_time_order_check CHECK (
    (session_sealed_at IS NULL OR session_sealed_at >= session_opened_at)
    AND (processing_started_at IS NULL OR processing_started_at >= COALESCE(session_sealed_at, session_opened_at))
    AND (delivery_completed_at IS NULL OR delivery_completed_at >= COALESCE(processing_started_at, session_opened_at))
  ),
  CONSTRAINT clinical_ai_sessions_retention_check CHECK (retention_expires_at >= created_at)
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_channel_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_profile_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'pwa', 'internal_upload')),
  provider_name text NOT NULL,
  sender_channel_id text NOT NULL,
  sender_wa_id text,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinical_ai_channel_bindings_unique_sender UNIQUE (provider_name, channel, sender_channel_id)
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.clinical_ai_sessions(id) ON DELETE CASCADE,
  provider_message_id text NOT NULL,
  provider_media_index integer NOT NULL DEFAULT 0 CHECK (provider_media_index >= 0),
  provider_media_url text,
  content_type text NOT NULL,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  sha256 text,
  storage_uri_raw text,
  storage_uri_normalized text,
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (
    status IN ('RECEIVED', 'FETCHED', 'NORMALIZED', 'REJECTED', 'FAILED', 'PURGED')
  ),
  received_at timestamptz NOT NULL DEFAULT now(),
  downloaded_at timestamptz,
  normalized_at timestamptz,
  retention_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinical_ai_media_items_retention_check CHECK (retention_expires_at >= created_at),
  CONSTRAINT clinical_ai_media_items_unique_provider_media UNIQUE (provider_message_id, provider_media_index)
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.clinical_ai_sessions(id) ON DELETE CASCADE,
  media_item_id uuid REFERENCES public.clinical_ai_media_items(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (
    stage IN (
      'MEDIA_FETCH',
      'AUDIO_PREP',
      'STT_SUBMIT',
      'STT_FINALIZE',
      'NORMALIZE',
      'REASON',
      'VALIDATE',
      'DELIVER',
      'CLEANUP'
    )
  ),
  status text NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED')
  ),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  idempotency_key text NOT NULL UNIQUE,
  queue_name text NOT NULL,
  provider_operation_ref text,
  error_code text,
  error_message_redacted text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.clinical_ai_sessions(id) ON DELETE CASCADE,
  media_item_id uuid REFERENCES public.clinical_ai_media_items(id) ON DELETE SET NULL,
  stt_provider text NOT NULL,
  language_code text NOT NULL,
  diarization_enabled boolean NOT NULL DEFAULT true,
  multi_channel_enabled boolean NOT NULL DEFAULT false,
  transcript_uri text NOT NULL,
  transcript_sha256 text NOT NULL,
  confidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  word_count integer CHECK (word_count IS NULL OR word_count >= 0),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_normalized_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.clinical_ai_sessions(id) ON DELETE CASCADE,
  source_transcript_id uuid NOT NULL REFERENCES public.clinical_ai_transcripts(id) ON DELETE CASCADE,
  normalizer_version text NOT NULL,
  segments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  clinical_entities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_context_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  transcript_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_context_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.clinical_ai_sessions(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('doctor_input', 'patient_record', 'merged')),
  context_version text NOT NULL,
  structured_context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_critical_context_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  completeness_score smallint CHECK (
    completeness_score IS NULL OR completeness_score BETWEEN 0 AND 100
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.clinical_ai_sessions(id) ON DELETE CASCADE,
  normalized_transcript_id uuid NOT NULL REFERENCES public.clinical_ai_normalized_transcripts(id) ON DELETE CASCADE,
  context_snapshot_id uuid REFERENCES public.clinical_ai_context_snapshots(id) ON DELETE SET NULL,
  model_name text NOT NULL,
  model_version text NOT NULL,
  prompt_version text NOT NULL,
  schema_version text NOT NULL,
  temperature numeric(3,2) NOT NULL DEFAULT 0 CHECK (temperature >= 0 AND temperature <= 2),
  seed integer,
  raw_output_uri text NOT NULL,
  validated_output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  validator_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('GENERATED', 'VALIDATED', 'REJECTED', 'ABSTAINED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.clinical_ai_sessions(id) ON DELETE CASCADE,
  output_id uuid NOT NULL REFERENCES public.clinical_ai_outputs(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'pwa', 'internal_notification')),
  provider_name text NOT NULL,
  provider_message_id text,
  delivery_status text NOT NULL CHECK (
    delivery_status IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED_RETRYABLE', 'FAILED_FINAL')
  ),
  payload_preview text,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clinical_ai_retention_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.clinical_ai_sessions(id) ON DELETE CASCADE,
  artifact_type text NOT NULL CHECK (
    artifact_type IN ('raw_audio', 'normalized_audio', 'transcript', 'normalized_transcript', 'output')
  ),
  artifact_ref text NOT NULL,
  action text NOT NULL CHECK (action IN ('PURGED', 'SKIPPED', 'RETAINED')),
  reason text,
  executed_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clinical_ai_sessions_doctor_opened
  ON public.clinical_ai_sessions(doctor_profile_id, session_opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_sessions_status_updated
  ON public.clinical_ai_sessions(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_sessions_active
  ON public.clinical_ai_sessions(channel, provider_name, session_opened_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_ai_channel_bindings_doctor_active
  ON public.clinical_ai_channel_bindings(doctor_profile_id, active);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_media_items_session_received
  ON public.clinical_ai_media_items(session_id, received_at);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_media_items_status_updated
  ON public.clinical_ai_media_items(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_jobs_queue_status_scheduled
  ON public.clinical_ai_jobs(queue_name, status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_jobs_session_stage_created
  ON public.clinical_ai_jobs(session_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_jobs_provider_operation_ref
  ON public.clinical_ai_jobs(provider_operation_ref)
  WHERE provider_operation_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_ai_transcripts_session_created
  ON public.clinical_ai_transcripts(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_normalized_transcripts_session_created
  ON public.clinical_ai_normalized_transcripts(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_context_snapshots_session_created
  ON public.clinical_ai_context_snapshots(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_outputs_session_created
  ON public.clinical_ai_outputs(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_outputs_status_created
  ON public.clinical_ai_outputs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_delivery_events_session_created
  ON public.clinical_ai_delivery_events(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_delivery_events_status_created
  ON public.clinical_ai_delivery_events(delivery_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_ai_retention_events_session_executed
  ON public.clinical_ai_retention_events(session_id, executed_at DESC);

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_clinical_ai_sessions_updated_at ON public.clinical_ai_sessions;
CREATE TRIGGER trg_clinical_ai_sessions_updated_at
  BEFORE UPDATE ON public.clinical_ai_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

DROP TRIGGER IF EXISTS trg_clinical_ai_channel_bindings_updated_at ON public.clinical_ai_channel_bindings;
CREATE TRIGGER trg_clinical_ai_channel_bindings_updated_at
  BEFORE UPDATE ON public.clinical_ai_channel_bindings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

DROP TRIGGER IF EXISTS trg_clinical_ai_media_items_updated_at ON public.clinical_ai_media_items;
CREATE TRIGGER trg_clinical_ai_media_items_updated_at
  BEFORE UPDATE ON public.clinical_ai_media_items
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

DROP TRIGGER IF EXISTS trg_clinical_ai_jobs_updated_at ON public.clinical_ai_jobs;
CREATE TRIGGER trg_clinical_ai_jobs_updated_at
  BEFORE UPDATE ON public.clinical_ai_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

DROP TRIGGER IF EXISTS trg_clinical_ai_transcripts_updated_at ON public.clinical_ai_transcripts;
CREATE TRIGGER trg_clinical_ai_transcripts_updated_at
  BEFORE UPDATE ON public.clinical_ai_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

DROP TRIGGER IF EXISTS trg_clinical_ai_normalized_transcripts_updated_at ON public.clinical_ai_normalized_transcripts;
CREATE TRIGGER trg_clinical_ai_normalized_transcripts_updated_at
  BEFORE UPDATE ON public.clinical_ai_normalized_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

DROP TRIGGER IF EXISTS trg_clinical_ai_context_snapshots_updated_at ON public.clinical_ai_context_snapshots;
CREATE TRIGGER trg_clinical_ai_context_snapshots_updated_at
  BEFORE UPDATE ON public.clinical_ai_context_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

DROP TRIGGER IF EXISTS trg_clinical_ai_outputs_updated_at ON public.clinical_ai_outputs;
CREATE TRIGGER trg_clinical_ai_outputs_updated_at
  BEFORE UPDATE ON public.clinical_ai_outputs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_ai_updated_at();

-- ============================================================================
-- 5. RLS
-- ============================================================================

ALTER TABLE public.clinical_ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_channel_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_normalized_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_ai_retention_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_ai_sessions_doctors_select ON public.clinical_ai_sessions;
CREATE POLICY clinical_ai_sessions_doctors_select
  ON public.clinical_ai_sessions
  FOR SELECT
  TO authenticated
  USING (doctor_profile_id = public.current_doctor_profile_id());

DROP POLICY IF EXISTS clinical_ai_sessions_admins_select ON public.clinical_ai_sessions;
CREATE POLICY clinical_ai_sessions_admins_select
  ON public.clinical_ai_sessions
  FOR SELECT
  TO authenticated
  USING (public.is_system_admin());

DROP POLICY IF EXISTS clinical_ai_channel_bindings_admins_select ON public.clinical_ai_channel_bindings;
CREATE POLICY clinical_ai_channel_bindings_admins_select
  ON public.clinical_ai_channel_bindings
  FOR SELECT
  TO authenticated
  USING (public.is_system_admin());

DROP POLICY IF EXISTS clinical_ai_normalized_transcripts_doctors_select ON public.clinical_ai_normalized_transcripts;
CREATE POLICY clinical_ai_normalized_transcripts_doctors_select
  ON public.clinical_ai_normalized_transcripts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clinical_ai_sessions s
      WHERE s.id = clinical_ai_normalized_transcripts.session_id
        AND s.doctor_profile_id = public.current_doctor_profile_id()
    )
  );

DROP POLICY IF EXISTS clinical_ai_normalized_transcripts_admins_select ON public.clinical_ai_normalized_transcripts;
CREATE POLICY clinical_ai_normalized_transcripts_admins_select
  ON public.clinical_ai_normalized_transcripts
  FOR SELECT
  TO authenticated
  USING (public.is_system_admin());

DROP POLICY IF EXISTS clinical_ai_context_snapshots_doctors_select ON public.clinical_ai_context_snapshots;
CREATE POLICY clinical_ai_context_snapshots_doctors_select
  ON public.clinical_ai_context_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clinical_ai_sessions s
      WHERE s.id = clinical_ai_context_snapshots.session_id
        AND s.doctor_profile_id = public.current_doctor_profile_id()
    )
  );

DROP POLICY IF EXISTS clinical_ai_context_snapshots_admins_select ON public.clinical_ai_context_snapshots;
CREATE POLICY clinical_ai_context_snapshots_admins_select
  ON public.clinical_ai_context_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_system_admin());

DROP POLICY IF EXISTS clinical_ai_outputs_doctors_select ON public.clinical_ai_outputs;
CREATE POLICY clinical_ai_outputs_doctors_select
  ON public.clinical_ai_outputs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clinical_ai_sessions s
      WHERE s.id = clinical_ai_outputs.session_id
        AND s.doctor_profile_id = public.current_doctor_profile_id()
    )
  );

DROP POLICY IF EXISTS clinical_ai_outputs_admins_select ON public.clinical_ai_outputs;
CREATE POLICY clinical_ai_outputs_admins_select
  ON public.clinical_ai_outputs
  FOR SELECT
  TO authenticated
  USING (public.is_system_admin());

-- ============================================================================
-- 6. GRANTS
-- ============================================================================

GRANT SELECT ON TABLE public.clinical_ai_sessions TO authenticated;
GRANT SELECT ON TABLE public.clinical_ai_channel_bindings TO authenticated;
GRANT SELECT ON TABLE public.clinical_ai_normalized_transcripts TO authenticated;
GRANT SELECT ON TABLE public.clinical_ai_context_snapshots TO authenticated;
GRANT SELECT ON TABLE public.clinical_ai_outputs TO authenticated;

GRANT ALL ON TABLE public.clinical_ai_sessions TO service_role;
GRANT ALL ON TABLE public.clinical_ai_channel_bindings TO service_role;
GRANT ALL ON TABLE public.clinical_ai_media_items TO service_role;
GRANT ALL ON TABLE public.clinical_ai_jobs TO service_role;
GRANT ALL ON TABLE public.clinical_ai_transcripts TO service_role;
GRANT ALL ON TABLE public.clinical_ai_normalized_transcripts TO service_role;
GRANT ALL ON TABLE public.clinical_ai_context_snapshots TO service_role;
GRANT ALL ON TABLE public.clinical_ai_outputs TO service_role;
GRANT ALL ON TABLE public.clinical_ai_delivery_events TO service_role;
GRANT ALL ON TABLE public.clinical_ai_retention_events TO service_role;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.clinical_ai_sessions IS 'Logical session container for deterministic clinical AI processing';
COMMENT ON TABLE public.clinical_ai_channel_bindings IS 'Trusted mapping between external channel identities and doctor profiles';
COMMENT ON TABLE public.clinical_ai_media_items IS 'Raw inbound media items associated with a clinical AI session';
COMMENT ON TABLE public.clinical_ai_jobs IS 'Background jobs for the clinical AI processing pipeline';
COMMENT ON TABLE public.clinical_ai_transcripts IS 'Raw STT transcript metadata with object storage references';
COMMENT ON TABLE public.clinical_ai_normalized_transcripts IS 'Normalized transcript ready for downstream clinical reasoning';
COMMENT ON TABLE public.clinical_ai_context_snapshots IS 'Structured clinical context snapshot used during model reasoning';
COMMENT ON TABLE public.clinical_ai_outputs IS 'Model and validator outputs for a clinical AI session';
COMMENT ON TABLE public.clinical_ai_delivery_events IS 'Delivery attempts and results for clinician-facing output messages';
COMMENT ON TABLE public.clinical_ai_retention_events IS 'Trace of purge and retention actions over temporary artifacts';
