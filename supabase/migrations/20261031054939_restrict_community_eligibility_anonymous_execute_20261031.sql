-- Applied to production under ledger version 20261031054939.
-- Only authenticated RLS policies (six) depend on this helper.
-- Anonymous callers have no patient identity; refuse direct RPC execution.
-- Preserve explicit grants for authenticated and service_role.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

DO $harden$
DECLARE v_oid oid := 'public.community_group_allowed_for_patient(uuid,uuid)'::regprocedure;
DECLARE v_policies int;
BEGIN
  SELECT count(*) INTO v_policies FROM pg_policies
    WHERE (qual ILIKE '%community_group_allowed_for_patient%'
       OR with_check ILIKE '%community_group_allowed_for_patient%')
      AND NOT (roles @> ARRAY['authenticated']::name[]);
  IF v_policies <> 0 THEN
    RAISE EXCEPTION 'Unexpected anonymous policy depends on eligibility helper';
  END IF;

  IF NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
     OR strpos(pg_get_functiondef(v_oid),'patients.user_id = auth.uid()')=0
  THEN
    RAISE EXCEPTION 'Ownership / authorized ACL prerequisite failed';
  END IF;

  REVOKE EXECUTE ON FUNCTION public.community_group_allowed_for_patient(uuid,uuid)
    FROM PUBLIC, anon;

  IF has_function_privilege('anon',v_oid,'EXECUTE')
     OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
  THEN
    RAISE EXCEPTION 'Eligibility ACL invariants failed';
  END IF;
END $harden$;
