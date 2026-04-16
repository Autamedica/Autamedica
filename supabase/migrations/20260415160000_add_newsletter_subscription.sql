-- 📧 GESTIÓN DE NEWSLETTER: BAJA VOLUNTARIA (AUTAMEDICA)
-- Cumplimiento de la ley de protección de datos (Derecho de Oposición).

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS newsletter_subscribed boolean DEFAULT true;

-- Índice para filtrar rápidamente en los envíos masivos
CREATE INDEX IF NOT EXISTS idx_profiles_newsletter_subscribed ON public.profiles (newsletter_subscribed) WHERE newsletter_subscribed = true;

COMMENT ON COLUMN public.profiles.newsletter_subscribed IS 'Indica si el paciente desea recibir la newsletter de Medicina Proactiva.';
