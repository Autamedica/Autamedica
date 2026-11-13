-- Run only in disposable local Supabase; never sends FCM or calls pg_net.
BEGIN;
DO $test$
DECLARE
  m text;
  t text;
  p text;
  claim text;
BEGIN
  IF pg_catalog.has_schema_privilege('anon', 'app_private', 'USAGE')
     OR pg_catalog.has_schema_privilege('authenticated', 'app_private', 'USAGE')
  THEN
    RAISE EXCEPTION 'Private push schema must not be exposed';
  END IF;

  IF pg_catalog.has_function_privilege(
      'anon', 'app_private.send_authenticated_dispatch_push(uuid,text,text,jsonb)', 'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'Public caller can invoke privileged dispatch push';
  END IF;

  IF pg_catalog.has_function_privilege('anon', 'public.match_dispatch_doctors(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.advance_expired_dispatch_offers()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Dispatch engine executable from client';
  END IF;

  SELECT pg_get_functiondef(
    'app_private.send_authenticated_dispatch_push(uuid,text,text,jsonb)'::regprocedure
  ) INTO p;
  IF position('autamedica_push_project_url' IN p) = 0
     OR position('autamedica_push_dispatch_secret' IN p) = 0
     OR position('v_project_url' IN p) = 0
  THEN
    RAISE EXCEPTION 'Push transport must use per-environment Vault URL and secret';
  END IF;

  SELECT pg_get_functiondef('public.claim_dispatch_offer(uuid)'::regprocedure)
    INTO claim;
  IF position('doctor_not_clinically_eligible' IN claim) = 0
     OR position('d.active IS TRUE' IN claim) = 0
     OR position('PENDING' IN claim) = 0
     OR position('COALESCE(auth.jwt()' IN claim) = 0
  THEN
    RAISE EXCEPTION 'Existing offers can be claimed without doctor eligibility and ownership checks';
  END IF;

  SELECT pg_get_functiondef('public.match_dispatch_doctors(uuid)'::regprocedure) INTO m;
  SELECT pg_get_functiondef('public.notify_on_duty_doctors_on_dispatch()'::regprocedure) INTO t;
  IF position('app_private.send_authenticated_dispatch_push' IN m) = 0
     OR position('app_private.send_authenticated_dispatch_push' IN t) = 0
  THEN
    RAISE EXCEPTION 'A dispatch producer still bypasses authenticated push';
  END IF;
  IF position('doctorId' IN m) > 0 THEN
    RAISE EXCEPTION 'Dispatch payload targets doctorId instead of userId';
  END IF;
  IF position('d.active IS TRUE' IN m) = 0
     OR position('PENDING(-|$)' IN m) = 0
     OR position('PENDING(-|$)' IN t) = 0
  THEN
    RAISE EXCEPTION 'Dispatch must reject inactive/provisional doctors';
  END IF;
  IF position('net.http_post' IN m) > 0
     OR position('net.http_post' IN t) > 0
  THEN
    RAISE EXCEPTION 'Dispatch producer still makes unauthenticated HTTP request';
  END IF;
END;
$test$;
ROLLBACK;
