-- 20260419000001_growth_os_leads_patch.sql
-- Este parche agrega la tabla leads que faltaba en la migración original de growth_os.

CREATE TABLE IF NOT EXISTS growth_os.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text,
  name text,
  vertical text DEFAULT 'general',
  intent text,
  status text DEFAULT 'new',
  form_id text,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE growth_os.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON growth_os.leads;
CREATE POLICY service_role_all ON growth_os.leads FOR ALL TO service_role USING (true) WITH CHECK (true);
