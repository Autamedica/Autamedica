-- Mirror of emergency production migration applied 2026-10-21.
-- Disable public execution of a privileged dynamic SQL diagnostic function.
-- Function retained temporarily for internal service role; removal requires impact review.
REVOKE EXECUTE ON FUNCTION public.execute_sql_temp(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.execute_sql_temp(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.execute_sql_temp(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sql_temp(text) TO service_role;
