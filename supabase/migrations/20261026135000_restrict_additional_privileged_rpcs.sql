-- Contain additional externally executable SECURITY DEFINER RPCs.
-- Existing internal trigger/cron owners and service_role retain the required
-- privileges. Direct client grants are not safe for these operations.
--
-- Some routines originate from legacy migrations and may not exist in a clean
-- disposable reconstruction; presence is checked explicitly before revocation.
DO $security$
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
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
    END IF;
  END LOOP;

  -- The on-duty doctor must be able to accept their own offer from the app,
  -- but an anonymous caller must never control the dispatcher.
  v_function := to_regprocedure('public.claim_dispatch_offer(uuid)');
  IF v_function IS NOT NULL THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_function);
  END IF;
END;
$security$;
