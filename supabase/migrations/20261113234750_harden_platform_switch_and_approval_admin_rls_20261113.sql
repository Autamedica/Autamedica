-- Remove user-editable JWT metadata from platform governance authorization.
-- Production profiles are keyed by user_id.
ALTER TABLE public.platform_operational_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_approval_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_operational_switches_admin_all ON public.platform_operational_switches;
DROP POLICY IF EXISTS admin_approval_decisions_admin_all ON public.admin_approval_decisions;
CREATE POLICY platform_operational_switches_admin_all ON public.platform_operational_switches
FOR ALL TO authenticated
USING (coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'))
WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'));
CREATE POLICY admin_approval_decisions_admin_all ON public.admin_approval_decisions
FOR ALL TO authenticated
USING (coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'))
WITH CHECK (coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin'
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.role = 'admin'));
REVOKE ALL ON public.platform_operational_switches FROM anon;
REVOKE ALL ON public.admin_approval_decisions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_operational_switches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_approval_decisions TO authenticated;
GRANT ALL ON public.platform_operational_switches TO service_role;
GRANT ALL ON public.admin_approval_decisions TO service_role;
