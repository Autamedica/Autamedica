-- Safe privileges-only tests: no clinical records, jobs or notifications.
BEGIN;
DO $test$
DECLARE
  v_signature text;
  v_function regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.create_patient_alert(uuid,text,uuid,text,text,text,jsonb,uuid)',
    'public.enqueue_notification(uuid,text,text,text,text,jsonb,text,timestamp with time zone)',
    'public.ensure_dispatch_patient(uuid,text,text)',
    'public.expire_stale_dispatch_requests()',
    'public.cleanup_stuck_conversation_sessions(text)',
    'public.get_user_audit_log(uuid,integer)'
  ] LOOP
    v_function := to_regprocedure(v_signature);
    IF v_function IS NOT NULL THEN
      IF has_function_privilege('anon', v_function, 'EXECUTE')
         OR has_function_privilege('authenticated', v_function, 'EXECUTE')
      THEN
        RAISE EXCEPTION 'Untrusted role can invoke privileged RPC %', v_signature;
      END IF;
      IF NOT has_function_privilege('service_role', v_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'Service role lost privileged RPC %', v_signature;
      END IF;
    END IF;
  END LOOP;

  v_function := to_regprocedure('public.claim_dispatch_offer(uuid)');
  IF v_function IS NOT NULL THEN
    IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'Anonymous users can claim dispatch offers';
    END IF;
    IF NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Legitimate offer acceptance lost execute grant';
    END IF;
  END IF;
END;
$test$;
ROLLBACK;
