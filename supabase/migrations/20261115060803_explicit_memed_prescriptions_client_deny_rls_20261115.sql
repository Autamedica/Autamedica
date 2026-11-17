-- Explicit restrictive policy for browser roles.
-- service_role retains its existing server-side table privileges and BYPASSRLS.
CREATE POLICY memed_prescriptions_deny_client_roles
ON public.memed_prescriptions
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMENT ON POLICY memed_prescriptions_deny_client_roles
ON public.memed_prescriptions
IS 'Explicit defense in depth: browser roles cannot read or mutate Memed provider events; server service_role performs authorized operations.';
