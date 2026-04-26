-- ──────────────────────────────────────────────────────────────
-- 1. NURTURING SEQUENCES
-- ──────────────────────────────────────────────────────────────

-- Add 'nurturing' to allowed job types
ALTER TABLE growth_os.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_job_type_check;
ALTER TABLE growth_os.email_jobs ADD CONSTRAINT email_jobs_job_type_check
  CHECK (job_type IN (
    'welcome', 'anamnesis_reminder', 'appointment_reminder', 'newsletter',
    'doctor_new_appointment', 'doctor_appointment_cancelled', 'doctor_anamnesis_ready',
    'patient_appointment_cancelled', 'patient_prescription_ready',
    'nurturing'
  ));

-- Sequence definitions
CREATE TABLE IF NOT EXISTS growth_os.nurturing_sequences (
  id         text PRIMARY KEY,          -- e.g. 'general', 'tdah', 'insomnio'
  name       text NOT NULL,
  vertical   text NOT NULL,
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Individual steps within a sequence
CREATE TABLE IF NOT EXISTS growth_os.nurturing_steps (
  id            serial PRIMARY KEY,
  sequence_id   text NOT NULL REFERENCES growth_os.nurturing_sequences(id) ON DELETE CASCADE,
  step_order    int NOT NULL,
  delay_hours   int NOT NULL,             -- hours after lead creation to send
  subject       text NOT NULL,
  template_key  text NOT NULL,            -- maps to renderNurturingEmail(key)
  enabled       boolean NOT NULL DEFAULT true,
  UNIQUE (sequence_id, step_order)
);

ALTER TABLE growth_os.nurturing_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_os.nurturing_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON growth_os.nurturing_sequences
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON growth_os.nurturing_steps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE growth_os.nurturing_sequences TO service_role;
GRANT ALL ON TABLE growth_os.nurturing_steps TO service_role;
GRANT ALL ON SEQUENCE growth_os.nurturing_steps_id_seq TO service_role;

-- Track which steps a lead has already received
ALTER TABLE growth_os.email_jobs ADD COLUMN IF NOT EXISTS nurturing_step_id int
  REFERENCES growth_os.nurturing_steps(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────
-- 2. SEED DEFAULT SEQUENCES
-- ──────────────────────────────────────────────────────────────

INSERT INTO growth_os.nurturing_sequences (id, name, vertical) VALUES
  ('general',  'Secuencia general',  'general'),
  ('tdah',     'Secuencia TDAH',     'tdah'),
  ('insomnio', 'Secuencia Insomnio', 'insomnio')
ON CONFLICT (id) DO NOTHING;

-- General sequence: 4 emails over 7 days
INSERT INTO growth_os.nurturing_steps (sequence_id, step_order, delay_hours, subject, template_key) VALUES
  ('general', 1,   0,   'Bienvenido a AutaMedica',                                 'welcome'),
  ('general', 2,  48,   'Tu historia clínica empieza antes de la consulta',         'nurturing_value_1'),
  ('general', 3, 120,   'Qué registra AutaMedica que otros sistemas no capturan',   'nurturing_value_2'),
  ('general', 4, 168,   'Tu próximo paso: agendar tu primera consulta',             'nurturing_cta')
ON CONFLICT (sequence_id, step_order) DO NOTHING;

-- TDAH sequence
INSERT INTO growth_os.nurturing_steps (sequence_id, step_order, delay_hours, subject, template_key) VALUES
  ('tdah', 1,   0,   'Bienvenido a AutaMedica — evaluación TDAH',                 'welcome'),
  ('tdah', 2,  48,   'TDAH en adultos: lo que la evaluación online puede detectar','nurturing_tdah_1'),
  ('tdah', 3, 120,   'Cómo funciona la evaluación clínica en AutaMedica',          'nurturing_tdah_2'),
  ('tdah', 4, 168,   'Agendá tu evaluación TDAH',                                 'nurturing_cta_tdah')
ON CONFLICT (sequence_id, step_order) DO NOTHING;

-- Insomnio sequence
INSERT INTO growth_os.nurturing_steps (sequence_id, step_order, delay_hours, subject, template_key) VALUES
  ('insomnio', 1,   0,   'Bienvenido a AutaMedica — consulta de sueño',            'welcome'),
  ('insomnio', 2,  48,   'Insomnio crónico: por qué la historia clínica importa', 'nurturing_insomnio_1'),
  ('insomnio', 3, 120,   'Qué esperar de tu consulta de sueño en AutaMedica',     'nurturing_insomnio_2'),
  ('insomnio', 4, 168,   'Agendá tu consulta de sueño',                           'nurturing_cta_insomnio')
ON CONFLICT (sequence_id, step_order) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 3. AUTO-ENQUEUE NURTURING FUNCTION
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION growth_os.enqueue_nurturing_emails(
  batch_limit integer DEFAULT 100
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = growth_os, public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- For each lead, find the next step they haven't received yet
  WITH eligible AS (
    SELECT
      l.id           AS lead_id,
      l.email,
      l.name,
      l.vertical,
      l.created_at   AS lead_created,
      ns.id          AS step_id,
      ns.step_order,
      ns.delay_hours,
      ns.subject,
      ns.template_key,
      ns.sequence_id
    FROM growth_os.leads l
    JOIN growth_os.nurturing_sequences seq
      ON seq.vertical = l.vertical
      AND seq.enabled = true
    JOIN growth_os.nurturing_steps ns
      ON ns.sequence_id = seq.id
      AND ns.enabled = true
    WHERE l.status NOT IN ('unsubscribed', 'bounced', 'spam')
      -- Step is due
      AND l.created_at + (ns.delay_hours || ' hours')::interval <= now()
      -- Not already sent
      AND NOT EXISTS (
        SELECT 1 FROM growth_os.email_jobs ej
        WHERE ej.dedupe_key = 'nurturing:' || l.id::text || ':' || ns.id::text
      )
    ORDER BY l.created_at ASC, ns.step_order ASC
    LIMIT batch_limit
  )
  INSERT INTO growth_os.email_jobs (
    job_type,
    recipient_email,
    recipient_name,
    dedupe_key,
    nurturing_step_id,
    template_data
  )
  SELECT
    CASE WHEN e.template_key = 'welcome' THEN 'welcome' ELSE 'nurturing' END,
    lower(e.email),
    e.name,
    'nurturing:' || e.lead_id::text || ':' || e.step_id::text,
    e.step_id,
    jsonb_build_object(
      'template_key', e.template_key,
      'subject', e.subject,
      'vertical', e.vertical,
      'sequence_id', e.sequence_id,
      'lead_id', e.lead_id,
      'action_url', 'https://www.autamedica.com/patients/anamnesis?utm_source=email&utm_medium=nurturing&utm_campaign=' || e.template_key,
      'unsubscribe_url', 'https://www.autamedica.com/unsubscribe?lead=' || e.lead_id::text
    )
  FROM eligible e
  ON CONFLICT (dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. ATTRIBUTION VIEW: lead → patient → appointment → payment
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW growth_os.lead_attribution AS
SELECT
  l.id                AS lead_id,
  l.email             AS lead_email,
  l.vertical,
  l.intent,
  l.form_id,
  l.first_utm_source,
  l.first_utm_medium,
  l.first_utm_campaign,
  l.created_at        AS lead_created_at,
  l.status            AS lead_status,
  pr.user_id,
  p.id                AS patient_id,
  a.id                AS appointment_id,
  a.start_time        AS appointment_time,
  a.status            AS appointment_status,
  pay.id              AS payment_id,
  pay.gross_amount    AS payment_amount,
  pay.status          AS payment_status,
  pay.paid_at         AS payment_date,
  -- Derived
  CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS converted_to_appointment,
  CASE WHEN pay.id IS NOT NULL AND pay.status = 'approved' THEN true ELSE false END AS converted_to_revenue,
  EXTRACT(EPOCH FROM (a.created_at - l.created_at)) / 3600.0 AS hours_to_appointment,
  EXTRACT(EPOCH FROM (pay.paid_at - l.created_at)) / 3600.0 AS hours_to_payment
FROM growth_os.leads l
LEFT JOIN public.profiles pr ON lower(pr.email) = lower(l.email)
LEFT JOIN public.patients p ON p.user_id = pr.user_id
LEFT JOIN public.appointments a ON a.patient_id = p.id
  AND a.status NOT IN ('cancelled')
LEFT JOIN public.appointment_payments pay ON pay.appointment_id = a.id;

GRANT SELECT ON growth_os.lead_attribution TO service_role;

-- ──────────────────────────────────────────────────────────────
-- 5. GROWTH DASHBOARD SUMMARY FUNCTION
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION growth_os.dashboard_summary(
  days_back integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = growth_os, public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'period_days', days_back,
    'total_leads', (SELECT count(*) FROM growth_os.leads WHERE created_at >= now() - (days_back || ' days')::interval),
    'leads_by_vertical', (
      SELECT jsonb_object_agg(vertical, cnt)
      FROM (SELECT vertical, count(*) as cnt FROM growth_os.leads WHERE created_at >= now() - (days_back || ' days')::interval GROUP BY vertical) t
    ),
    'leads_by_utm_source', (
      SELECT jsonb_object_agg(coalesce(first_utm_source, 'direct'), cnt)
      FROM (SELECT first_utm_source, count(*) as cnt FROM growth_os.leads WHERE created_at >= now() - (days_back || ' days')::interval GROUP BY first_utm_source) t
    ),
    'leads_by_day', (
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', cnt) ORDER BY d)
      FROM (SELECT date_trunc('day', created_at)::date as d, count(*) as cnt FROM growth_os.leads WHERE created_at >= now() - (days_back || ' days')::interval GROUP BY d) t
    ),
    'emails_sent', (SELECT count(*) FROM growth_os.email_jobs WHERE status = 'sent' AND sent_at >= now() - (days_back || ' days')::interval),
    'emails_by_type', (
      SELECT jsonb_object_agg(job_type, cnt)
      FROM (SELECT job_type, count(*) as cnt FROM growth_os.email_jobs WHERE status = 'sent' AND sent_at >= now() - (days_back || ' days')::interval GROUP BY job_type) t
    ),
    'conversions', (
      SELECT jsonb_build_object(
        'lead_to_appointment', count(*) FILTER (WHERE converted_to_appointment),
        'lead_to_revenue', count(*) FILTER (WHERE converted_to_revenue),
        'total_revenue', coalesce(sum(payment_amount) FILTER (WHERE converted_to_revenue), 0)
      )
      FROM growth_os.lead_attribution
      WHERE lead_created_at >= now() - (days_back || ' days')::interval
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
