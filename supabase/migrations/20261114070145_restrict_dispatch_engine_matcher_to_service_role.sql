REVOKE ALL ON FUNCTION public.match_dispatch_doctors(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_dispatch_doctors(uuid) TO service_role;
