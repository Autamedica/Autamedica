-- Authenticated payment flows may read platform switch state; only admins may write it.
DROP POLICY IF EXISTS platform_operational_switches_authenticated_read ON public.platform_operational_switches;
CREATE POLICY platform_operational_switches_authenticated_read ON public.platform_operational_switches
FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.platform_operational_switches TO authenticated;
