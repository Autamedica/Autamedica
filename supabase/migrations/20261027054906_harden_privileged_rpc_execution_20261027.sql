-- Security hardening: privileged RPCs are service-role-only.
-- Migration executed on production (qxjjrpksmwwrmubhvjew) as
-- 20261027054906_harden_privileged_rpc_execution_20261027.
-- These functions are designed for trusted backend jobs/cron, not browsers.
-- Grants are idempotent. No clinical records, wallets or business data are mutated.
-- Review other SECURITY DEFINER functions separately; not every RPC is backend-only.

REVOKE ALL ON FUNCTION public.process_all_monthly_reserve_accruals(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_all_monthly_reserve_accruals(text) TO service_role;

REVOKE ALL ON FUNCTION public.process_monthly_reserve_accrual(uuid, text, public.patient_subscription_tier, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_monthly_reserve_accrual(uuid, text, public.patient_subscription_tier, boolean, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.process_monthly_reserve_accrual(uuid, text, public.patient_subscription_tier, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_monthly_reserve_accrual(uuid, text, public.patient_subscription_tier, boolean, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_stuck_conversation_sessions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_conversation_sessions(text) TO service_role;

REVOKE ALL ON FUNCTION public.create_content_piece(text, text, text[], jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_content_piece(text, text, text[], jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_content_pieces_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_content_pieces_due() TO service_role;

REVOKE ALL ON FUNCTION public.set_content_piece_status(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_content_piece_status(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.log_publish(uuid, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_publish(uuid, text, text, jsonb, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.insert_geo_citation(text, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_geo_citation(text, text, boolean, text) TO service_role;

REVOKE ALL ON FUNCTION public.is_channel_enabled(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_enabled(text) TO service_role;

-- These two legacy Growth OS RPCs exist in production but are absent from
-- the versioned baseline. Keep their ACLs strict wherever they exist without
-- creating placeholder routines or failing a clean database reconstruction.
DO $legacy_rpc_acl$
DECLARE
  v_signature text;
  v_function regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.claim_next_topic(text)',
    'public.resolve_topic(bigint,text,uuid,text)'
  ] LOOP
    v_function := pg_catalog.to_regprocedure(v_signature);
    IF v_function IS NULL THEN
      RAISE NOTICE 'Legacy optional RPC absent; no ACL to change: %', v_signature;
    ELSE
      EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function);
      EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
    END IF;
  END LOOP;
END;
$legacy_rpc_acl$;

REVOKE ALL ON FUNCTION public.recalculate_all_rankings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_rankings() TO service_role;

NOTIFY pgrst, 'reload schema';
