-- Mirror of live migration applied 2026-10-21.
-- Legacy role-setting SECURITY DEFINER RPCs are not referenced by current app
-- runtime source code; block direct calls until secure trusted provisioning exists.
REVOKE EXECUTE ON FUNCTION public.set_user_role(public.user_role)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_portal_and_role(text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(public.user_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_portal_and_role(text,text,uuid) TO service_role;
