-- Reconcile production-only Growth OS dispatch objects with the migration history.
-- Existing production tables are preserved; fresh databases receive the same schema.
CREATE TABLE IF NOT EXISTS growth_os.agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL CHECK (
    agent_type = ANY (ARRAY['concierge','compliance_auditor','waiting_room_guardian','data_integrity_sync'])
  ),
  trigger_type text NOT NULL,
  source_table text,
  source_id text,
  lead_id uuid REFERENCES growth_os.leads(id) ON DELETE SET NULL,
  appointment_id uuid,
  channel text NOT NULL CHECK (
    channel = ANY (ARRAY['whatsapp_openclaw','whatsapp_business_api','email_resend','email_brevo','admin_report'])
  ),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status = ANY (ARRAY['pending','reasoning','blocked','ready','sent','failed','cancelled'])
  ),
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_agent_jobs_due
  ON growth_os.agent_jobs (status, scheduled_for, created_at);
CREATE INDEX IF NOT EXISTS idx_growth_agent_jobs_lead
  ON growth_os.agent_jobs (lead_id, created_at DESC);

ALTER TABLE growth_os.agent_jobs ENABLE ROW LEVEL SECURITY;
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='growth_os' AND tablename='agent_jobs' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON growth_os.agent_jobs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END;
$policy$;
REVOKE ALL ON TABLE growth_os.agent_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE growth_os.agent_jobs TO service_role;

CREATE TABLE IF NOT EXISTS growth_os.suppressed_notification_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel = ANY (ARRAY['email','whatsapp'])),
  contact_value text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (channel, contact_value)
);

CREATE INDEX IF NOT EXISTS idx_suppressed_notification_contacts_lookup
  ON growth_os.suppressed_notification_contacts (channel, contact_value);

ALTER TABLE growth_os.suppressed_notification_contacts ENABLE ROW LEVEL SECURITY;
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='growth_os'
      AND tablename='suppressed_notification_contacts'
      AND policyname='service_role_all_suppressed_notification_contacts'
  ) THEN
    CREATE POLICY service_role_all_suppressed_notification_contacts
      ON growth_os.suppressed_notification_contacts
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END;
$policy$;
REVOKE ALL ON TABLE growth_os.suppressed_notification_contacts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE growth_os.suppressed_notification_contacts TO service_role;

CREATE OR REPLACE FUNCTION growth_os.normalize_notification_contact(
  contact_channel text,
  contact_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO pg_catalog, growth_os, public, extensions, pg_temp
AS $function$
  SELECT CASE
    WHEN contact_channel = 'email' THEN lower(btrim(coalesce(contact_value, '')))
    WHEN contact_channel = 'whatsapp' THEN regexp_replace(coalesce(contact_value, ''), '[^0-9]', '', 'g')
    ELSE btrim(coalesce(contact_value, ''))
  END;
$function$;

CREATE OR REPLACE FUNCTION growth_os.claim_due_agent_jobs(batch_size integer DEFAULT 25)
RETURNS SETOF growth_os.agent_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO pg_catalog, growth_os, public, extensions, pg_temp
AS $function$
  WITH due AS (
    SELECT id
    FROM growth_os.agent_jobs
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC, created_at ASC
    LIMIT greatest(batch_size, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE growth_os.agent_jobs j
     SET status = 'reasoning',
         attempts = attempts + 1,
         updated_at = now()
    FROM due
   WHERE j.id = due.id
  RETURNING j.*;
$function$;

CREATE OR REPLACE FUNCTION growth_os.dashboard_summary(days_back integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, growth_os, public, extensions, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'period_days', days_back,
    'total_leads', (SELECT count(*) FROM growth_os.leads WHERE created_at >= now() - (days_back || ' days')::interval),
    'leads_by_vertical', (
      SELECT jsonb_object_agg(vertical, cnt)
      FROM (SELECT vertical, count(*) AS cnt FROM growth_os.leads WHERE created_at >= now() - (days_back || ' days')::interval GROUP BY vertical) t
    ),
    'leads_by_utm_source', (
      SELECT jsonb_object_agg(coalesce(first_utm_source, 'direct'), cnt)
      FROM (SELECT first_utm_source, count(*) AS cnt FROM growth_os.leads WHERE created_at >= now() - (days_back || ' days')::interval GROUP BY first_utm_source) t
    ),
    'leads_by_day', (
      SELECT jsonb_agg(jsonb_build_object('date', d, 'count', cnt) ORDER BY d)
      FROM (SELECT date_trunc('day', created_at)::date AS d, count(*) AS cnt FROM growth_os.leads WHERE created_at >= now() - (days_back || ' days')::interval GROUP BY d) t
    ),
    'emails_sent', (SELECT count(*) FROM growth_os.email_jobs WHERE status = 'sent' AND sent_at >= now() - (days_back || ' days')::interval),
    'emails_by_type', (
      SELECT jsonb_object_agg(job_type, cnt)
      FROM (SELECT job_type, count(*) AS cnt FROM growth_os.email_jobs WHERE status = 'sent' AND sent_at >= now() - (days_back || ' days')::interval GROUP BY job_type) t
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
$function$;

CREATE OR REPLACE FUNCTION growth_os.enqueue_anamnesis_reminders(
  batch_limit integer DEFAULT 50,
  min_profile_age interval DEFAULT '2 hours'::interval
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, growth_os, public, extensions, pg_temp
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH candidates AS (
    SELECT
      pr.user_id,
      lower(pr.email) AS email,
      nullif(btrim(coalesce(pr.first_name, '')), '') AS first_name,
      (
        SELECT p.id
        FROM public.patients p
        WHERE p.user_id = pr.user_id
        ORDER BY p.created_at DESC NULLS LAST
        LIMIT 1
      ) AS patient_id
    FROM public.profiles pr
    WHERE pr.email IS NOT NULL
      AND btrim(pr.email) <> ''
      AND coalesce(pr.newsletter_subscribed, true) IS TRUE
      AND (pr.role IS NULL OR pr.role = 'patient')
      AND coalesce(pr.created_at, now()) <= now() - min_profile_age
      AND NOT EXISTS (
        SELECT 1
        FROM public.patients p2
        JOIN public.anamnesis a ON a.patient_id = p2.id
        WHERE p2.user_id = pr.user_id
          AND a.deleted_at IS NULL
          AND (
            a.completed_at IS NOT NULL
            OR a.status = 'completed'
            OR coalesce(a.completion_percentage, 0) >= 100
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM growth_os.email_jobs ej
        WHERE ej.dedupe_key = 'anamnesis_reminder:' || coalesce(pr.user_id::text, lower(pr.email)) || ':initial'
      )
    ORDER BY pr.created_at ASC NULLS LAST
    LIMIT greatest(batch_limit, 0)
  )
  INSERT INTO growth_os.email_jobs (
    job_type, recipient_email, recipient_name, user_id, patient_id, dedupe_key, template_data
  )
  SELECT
    'anamnesis_reminder', c.email, c.first_name, c.user_id, c.patient_id,
    'anamnesis_reminder:' || coalesce(c.user_id::text, c.email) || ':initial',
    jsonb_build_object(
      'action_url', 'https://www.autamedica.com/patients/anamnesis?utm_source=email&utm_medium=reminder&utm_campaign=anamnesis_activation',
      'unsubscribe_url', 'https://www.autamedica.com/unsubscribe?user=' || coalesce(c.user_id::text, c.email)
    )
  FROM candidates c
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION growth_os.enqueue_nurturing_emails(batch_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, growth_os, public, extensions, pg_temp
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH eligible AS (
    SELECT l.id AS lead_id, l.email, l.name, l.vertical, l.created_at AS lead_created,
      ns.id AS step_id, ns.step_order, ns.delay_hours, ns.subject, ns.template_key, ns.sequence_id
    FROM growth_os.leads l
    JOIN growth_os.nurturing_sequences seq ON seq.vertical = l.vertical AND seq.enabled = true
    JOIN growth_os.nurturing_steps ns ON ns.sequence_id = seq.id AND ns.enabled = true
    WHERE l.status NOT IN ('unsubscribed', 'bounced', 'spam')
      AND l.created_at + (ns.delay_hours || ' hours')::interval <= now()
      AND NOT EXISTS (
        SELECT 1 FROM growth_os.email_jobs ej
        WHERE ej.dedupe_key = 'nurturing:' || l.id::text || ':' || ns.id::text
      )
    ORDER BY l.created_at ASC, ns.step_order ASC
    LIMIT batch_limit
  )
  INSERT INTO growth_os.email_jobs (
    job_type, recipient_email, recipient_name, dedupe_key, nurturing_step_id, template_data
  )
  SELECT
    CASE WHEN e.template_key = 'welcome' THEN 'welcome' ELSE 'nurturing' END,
    lower(e.email), e.name, 'nurturing:' || e.lead_id::text || ':' || e.step_id::text,
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
$function$;

CREATE OR REPLACE FUNCTION growth_os.is_notification_contact_suppressed(
  contact_channel text,
  contact_value text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, growth_os, public, extensions, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM growth_os.suppressed_notification_contacts c
    WHERE c.channel = contact_channel
      AND c.contact_value = growth_os.normalize_notification_contact(contact_channel, contact_value)
  );
$function$;

REVOKE EXECUTE ON FUNCTION growth_os.claim_due_agent_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_os.dashboard_summary(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_os.enqueue_anamnesis_reminders(integer, interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_os.enqueue_nurturing_emails(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION growth_os.is_notification_contact_suppressed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION growth_os.claim_due_agent_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION growth_os.dashboard_summary(integer) TO service_role;
GRANT EXECUTE ON FUNCTION growth_os.enqueue_anamnesis_reminders(integer, interval) TO service_role;
GRANT EXECUTE ON FUNCTION growth_os.enqueue_nurturing_emails(integer) TO service_role;
GRANT EXECUTE ON FUNCTION growth_os.is_notification_contact_suppressed(text, text) TO service_role;
