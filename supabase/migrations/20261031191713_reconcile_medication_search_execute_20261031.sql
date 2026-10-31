-- Reconcile production with the original authenticated-only medication search contract.
REVOKE EXECUTE ON FUNCTION public.search_medications_br(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_medications_br(text, integer) TO authenticated, service_role;
