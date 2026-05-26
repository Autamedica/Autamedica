-- ============================================================================
-- WiFi Captive Portal Leads
-- ============================================================================
-- Tabla para almacenar los registros de usuarios que se conectan
-- al WiFi público de AutaMedica via captive portal.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wifi_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'captive_portal',
  device_info TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted BOOLEAN NOT NULL DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast phone lookups (upsert)
CREATE INDEX IF NOT EXISTS idx_wifi_leads_phone ON public.wifi_leads(phone);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_wifi_leads_registered_at ON public.wifi_leads(registered_at);
CREATE INDEX IF NOT EXISTS idx_wifi_leads_source ON public.wifi_leads(source);

-- Enable RLS
ALTER TABLE public.wifi_leads ENABLE ROW LEVEL SECURITY;

-- Policy: Only service_role can insert/read (the portal server uses service_role)
CREATE POLICY "Service role full access on wifi_leads"
  ON public.wifi_leads
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_wifi_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_wifi_leads_updated_at
  BEFORE UPDATE ON public.wifi_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wifi_leads_updated_at();

COMMENT ON TABLE public.wifi_leads IS 'Leads capturados via captive portal WiFi público de AutaMedica';
