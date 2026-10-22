-- Mirror of security migration applied in production on 2026-10-21.
-- Only server-side admin routes reference these data projections in current app code.
-- Lock clinical metadata, consultation URLs, user identifiers and financial statistics.
REVOKE ALL ON TABLE public.clinical_gold_seasonal_metrics
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.telemedicine_sessions_canonical
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_identifiers
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.clinic_financial_metrics
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.clinical_gold_seasonal_metrics TO service_role;
GRANT SELECT ON TABLE public.telemedicine_sessions_canonical TO service_role;
GRANT SELECT ON TABLE public.user_identifiers TO service_role;
GRANT SELECT ON TABLE public.clinic_financial_metrics TO service_role;
