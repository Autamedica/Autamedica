-- Manual, read-only regression probe for public.get_user_role(uuid).
-- Run as a database administrator in an isolated transaction.
-- No real identities are emitted and no patient/clinical rows are changed.
-- The selected existing profile is used only inside this transaction.
BEGIN;
DO $verify$
DECLARE
  v_subject uuid;
BEGIN
  SELECT user_id INTO v_subject FROM public.profiles
  WHERE user_id IS NOT NULL AND role IS NOT NULL
  LIMIT 1;

  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'No profile available for regression verification';
  END IF;

  -- Deny a caller with no subject querying any arbitrary existing user.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Anonymous test context invalid';
  END IF;
  BEGIN
    PERFORM public.get_user_role(v_subject);
    RAISE EXCEPTION 'UNAUTHORIZED_ROLE_READ_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'access_denied' THEN RAISE; END IF;
  END;

  -- Preserve legitimate self-service role reads.
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_subject)::text, true);
  IF auth.uid() IS DISTINCT FROM v_subject
     OR public.get_user_role(v_subject) IS NULL THEN
    RAISE EXCEPTION 'Authenticated self-read unexpectedly denied';
  END IF;

  -- Preserve service_role access to explicit subject lookups.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF public.get_user_role(v_subject) IS NULL THEN
    RAISE EXCEPTION 'Service-role lookup unexpectedly denied';
  END IF;
END;
$verify$;
ROLLBACK;
