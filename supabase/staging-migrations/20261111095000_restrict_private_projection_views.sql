-- Restrict private clinical, telemedicine, financial and health projections
-- to service_role. These are consumed by server-side admin/monitoring routes only.
REVOKE ALL ON TABLE public.clinical_gold_seasonal_metrics FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.telemedicine_sessions_canonical FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.user_identifiers FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.clinic_financial_metrics FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.v_db_health FROM PUBLIC,anon,authenticated;

GRANT SELECT ON TABLE public.clinical_gold_seasonal_metrics TO service_role;
GRANT SELECT ON TABLE public.telemedicine_sessions_canonical TO service_role;
GRANT SELECT ON TABLE public.user_identifiers TO service_role;
GRANT SELECT ON TABLE public.clinic_financial_metrics TO service_role;
GRANT SELECT ON TABLE public.v_db_health TO service_role;
