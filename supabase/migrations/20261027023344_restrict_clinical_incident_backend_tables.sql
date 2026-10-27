-- Applied and verified in production; preserve the exact migration ledger version.
REVOKE ALL ON TABLE public.clinical_incidents, public.clinical_incident_events, public.clinical_outbox_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.clinical_incidents, public.clinical_incident_events, public.clinical_outbox_events TO service_role;
ALTER POLICY "Authenticated users can select clinical_incidents" ON public.clinical_incidents TO service_role;
ALTER POLICY "Authenticated users can insert clinical_incidents" ON public.clinical_incidents TO service_role;
ALTER POLICY "Authenticated users can select clinical_incident_events" ON public.clinical_incident_events TO service_role;
ALTER POLICY "Authenticated users can insert clinical_incident_events" ON public.clinical_incident_events TO service_role;
ALTER POLICY "Authenticated users can select outbox" ON public.clinical_outbox_events TO service_role;
ALTER POLICY "Authenticated users can insert outbox" ON public.clinical_outbox_events TO service_role;
