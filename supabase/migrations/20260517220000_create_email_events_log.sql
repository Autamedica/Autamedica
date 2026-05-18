-- 📊 TABLA DE LOGS DE EMAILS EN TIEMPO REAL
-- Guarda los eventos de webhooks de Brevo y Resend para analíticas.

CREATE TABLE IF NOT EXISTS public.email_events_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text NOT NULL,
    event_type text NOT NULL, -- 'delivered', 'opened', 'click', 'bounced', etc.
    provider text NOT NULL, -- 'brevo' o 'resend'
    provider_message_id text,
    subject text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Índices para velocidad en el dashboard
CREATE INDEX IF NOT EXISTS idx_email_events_date ON public.email_events_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON public.email_events_log (event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_email ON public.email_events_log (email);

-- Seguridad (Solo Admins pueden leer)
ALTER TABLE public.email_events_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email events"
ON public.email_events_log FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'role' = 'admin');

-- Service Role puede insertar (el Webhook usará el service_role key)
CREATE POLICY "Service Role can insert events"
ON public.email_events_log FOR INSERT
TO service_role
WITH CHECK (true);

COMMENT ON TABLE public.email_events_log IS 'Logs en tiempo real de interacción de correos electrónicos.';
