-- Harden telemedicine call RPC permissions.
-- Objective: allow execution only from service_role (Edge Functions backend).

DO $$
BEGIN
  IF to_regprocedure('public.create_call(uuid,uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_call(uuid,uuid) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_call(uuid,uuid) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.create_call(uuid,uuid) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_call(uuid,uuid) TO service_role';
    EXECUTE 'ALTER FUNCTION public.create_call(uuid,uuid) SECURITY DEFINER SET search_path = public, extensions';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.update_call_status(uuid,public.call_status,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_call_status(uuid,public.call_status,text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_call_status(uuid,public.call_status,text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.update_call_status(uuid,public.call_status,text) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.update_call_status(uuid,public.call_status,text) TO service_role';
    EXECUTE 'ALTER FUNCTION public.update_call_status(uuid,public.call_status,text) SECURITY DEFINER SET search_path = public, extensions';
  END IF;
END $$;
