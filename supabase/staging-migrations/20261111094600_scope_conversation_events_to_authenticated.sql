-- Conversation events contain private patient/doctor chat content. Their policies
-- rely on the authenticated session identity and must not target PUBLIC.
ALTER POLICY "Doctors can insert chat messages"
  ON public.conversation_events TO authenticated;
ALTER POLICY "Doctors can view their own conversation events"
  ON public.conversation_events TO authenticated;
ALTER POLICY "Patients can view their own conversation events"
  ON public.conversation_events TO authenticated;

REVOKE ALL ON TABLE public.conversation_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.conversation_events TO authenticated;
GRANT ALL ON TABLE public.conversation_events TO service_role;
