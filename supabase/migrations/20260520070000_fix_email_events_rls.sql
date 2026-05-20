-- 🛡️ ACTUALIZACIÓN DE POLÍTICA RLS PARA EVENTOS DE EMAIL EN TIEMPO REAL
-- Permite que los usuarios autenticados puedan leer los eventos de email para el Dashboard de Administración.

DROP POLICY IF EXISTS "Admins can view email events" ON public.email_events_log;

CREATE POLICY "Authenticated users can view email events"
ON public.email_events_log FOR SELECT
TO authenticated
USING (true);

COMMENT ON POLICY "Authenticated users can view email events" ON public.email_events_log IS 'Permite que cualquier usuario autenticado en la plataforma (incluyendo platform_admin) visualice las estadísticas de interacción de correos.';
