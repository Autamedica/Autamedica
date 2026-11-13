-- Conversation events are private chat content. Keep participant policies
-- authenticated-only and service writes service_role-only.
ALTER POLICY "Doctors can insert chat messages"
  ON public.conversation_events TO authenticated;
ALTER POLICY "Doctors can view their own conversation events"
  ON public.conversation_events TO authenticated;
ALTER POLICY "Patients can insert chat messages"
  ON public.conversation_events TO authenticated;
ALTER POLICY "Patients can view their own conversation events"
  ON public.conversation_events TO authenticated;
ALTER POLICY "Service role can insert conversation events"
  ON public.conversation_events TO service_role;

REVOKE ALL ON TABLE public.conversation_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.conversation_events TO authenticated;
GRANT ALL ON TABLE public.conversation_events TO service_role;
