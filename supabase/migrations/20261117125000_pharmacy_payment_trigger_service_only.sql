-- Trigger function is an internal service-only entry point; triggers still invoke it.
REVOKE ALL ON FUNCTION public.activate_paid_pharmacy_dispatch()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_paid_pharmacy_dispatch()
  TO service_role;
