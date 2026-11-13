-- Already applied to production as ledger version 20261031060421.
-- This activity RPC has no anonymous RLS dependencies and rejects unauthenticated
-- calls with SQLSTATE 42501. Restrict the API grant; preserve its entire body.
SET lock_timeout = '2s';
SET statement_timeout = '15s';
DO $guard$
DECLARE v_oid oid := to_regprocedure('public.get_doctor_online_minutes(uuid,timestamp with time zone,timestamp with time zone)');
BEGIN
 IF v_oid IS NULL
   OR (SELECT NOT prosecdef FROM pg_proc WHERE oid=v_oid)
   OR strpos(pg_get_functiondef(v_oid),'Not authorized to read this doctor activity')=0
   OR (SELECT count(*) FROM pg_policies WHERE concat_ws(' ',qual,with_check) ILIKE '%get_doctor_online_minutes%') <> 0
 THEN RAISE EXCEPTION 'Unexpected activity RPC / policy dependencies'; END IF;
 IF NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
   OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
 THEN RAISE EXCEPTION 'Authenticated/service permission prerequisite missing'; END IF;

 REVOKE EXECUTE ON FUNCTION public.get_doctor_online_minutes(uuid,timestamp with time zone,timestamp with time zone)
 FROM PUBLIC,anon;

 IF has_function_privilege('anon',v_oid,'EXECUTE')
   OR NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
   OR NOT has_function_privilege('service_role',v_oid,'EXECUTE')
 THEN RAISE EXCEPTION 'Doctor activity RPC grants unexpected'; END IF;
END $guard$;
