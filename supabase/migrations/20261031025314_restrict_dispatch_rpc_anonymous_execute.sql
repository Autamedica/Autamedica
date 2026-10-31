-- Remove inherited anonymous execution from authenticated-only medical dispatch RPCs.
-- Existing function bodies, authenticated/service_role grants, and trigger ACLs are unchanged.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

DO $hardening$
DECLARE
  signature text;
  function_oid oid;
  original_definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.doctor_heartbeat(uuid)',
    'public.claim_pharmacy_request_tier(uuid,uuid)',
    'public.set_doctor_duty_status(uuid,boolean,public.dispatch_tier_category[])'
  ]
  LOOP
    function_oid := to_regprocedure(signature);
    IF function_oid IS NULL THEN
      RAISE EXCEPTION 'Required dispatch RPC is missing: %', signature;
    END IF;
    IF NOT has_function_privilege('authenticated', function_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Expected trusted-role grants missing: %', signature;
    END IF;
    original_definition := pg_get_functiondef(function_oid);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', function_oid::regprocedure);
    IF has_function_privilege('anon', function_oid, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', function_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', function_oid, 'EXECUTE')
       OR pg_get_functiondef(function_oid) IS DISTINCT FROM original_definition THEN
      RAISE EXCEPTION 'Dispatch RPC privilege invariant failed: %', signature;
    END IF;
  END LOOP;
END;
$hardening$;
