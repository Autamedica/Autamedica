-- Production ledger counterpart: 20261026064540.
-- A direct production ACL hotfix was applied before these source files were
-- reconciled. On a clean local replay legacy optional RPCs may not exist:
-- revoke if present; never create or expose missing routines.
-- Appointment payment RPCs are purposely excluded: they are hardened by the
-- separate 20261026065035 migration, whose compatibility was verified.
DO $guard$
DECLARE
  v_signature text;
  v_fn regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.drain_notification_queue(integer)',
    'public.fn_cleanup_old_audit_logs(integer)',
    'public.cancel_pharmacy_consultation_request(uuid,text)',
    'public.redeem_reserve_benefit(uuid,uuid,integer,text)',
    'public.create_patient_alert(uuid,text,uuid,text,text,text,jsonb,uuid)',
    'public.enqueue_notification(uuid,text,text,text,text,jsonb,text,timestamp with time zone)',
    'public.ensure_dispatch_patient(uuid,text,text)',
    'public.expire_stale_dispatch_requests()',
    'public.get_user_audit_log(uuid,integer)',
    'public.match_dispatch_doctors(uuid)',
    'public.advance_expired_dispatch_offers()'
  ] LOOP
    v_fn := to_regprocedure(v_signature);
    IF v_fn IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
    END IF;
  END LOOP;

  v_fn := to_regprocedure('public.claim_dispatch_offer(uuid)');
  IF v_fn IS NOT NULL THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END IF;
END;
$guard$;
