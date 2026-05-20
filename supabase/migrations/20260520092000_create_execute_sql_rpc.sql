-- Migration: Create temporary helper function for metadata diagnosis
-- Will be dropped in the next migration step

CREATE OR REPLACE FUNCTION public.execute_sql_temp(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  EXECUTE 'SELECT coalesce(jsonb_agg(t), ''[]''::jsonb) FROM (' || sql_query || ') t' INTO v_result;
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_sql_temp(text) TO service_role;
