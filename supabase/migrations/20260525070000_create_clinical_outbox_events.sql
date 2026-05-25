-- Migration: 20260525070000_create_clinical_outbox_events.sql
-- Goal: Add transactional outbox for Clinical Safety & Rule Traceability alerts

CREATE TABLE IF NOT EXISTS public.clinical_outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,             -- 'safety_rule_evaluated', 'safety_rule_overridden'
  payload JSONB NOT NULL,               -- Event payload containing execution context
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- RLS Configuration
ALTER TABLE public.clinical_outbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select outbox" ON public.clinical_outbox_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert outbox" ON public.clinical_outbox_events FOR INSERT TO authenticated WITH CHECK (true);

-- Indexing
CREATE INDEX idx_clinical_outbox_status_pending ON public.clinical_outbox_events(status) WHERE status = 'pending';
CREATE INDEX idx_clinical_outbox_created ON public.clinical_outbox_events(created_at);
