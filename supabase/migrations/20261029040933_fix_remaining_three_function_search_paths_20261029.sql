-- Mirrored from applied AutaMedica production migration 2026-10-29.
-- Clinical routines have schema-qualified table references and use pg_catalog functions.
ALTER FUNCTION public.process_anamnesis_extraction_silver_layer() SET search_path = pg_catalog;
ALTER FUNCTION public.log_clinical_rule_evaluation_transaction(uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid) SET search_path = pg_catalog;
-- Legacy diagnostic SQL RPC is service_role-only; preserve public name resolution, with pg_temp last.
ALTER FUNCTION public.execute_sql_temp(text) SET search_path = pg_catalog, public, pg_temp;
