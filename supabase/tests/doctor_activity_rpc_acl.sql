-- Static non-destructive ACL regression check; does not need test patient data.
DO $test$
DECLARE v_oid oid := 'public.get_doctor_online_minutes(uuid,timestamp with time zone,timestamp with time zone)'::regprocedure;
BEGIN
 IF has_function_privilege('anon',v_oid,'EXECUTE') THEN
   RAISE EXCEPTION 'Anonymous doctor activity access regression';
 END IF;
 IF NOT has_function_privilege('authenticated',v_oid,'EXECUTE')
 OR NOT has_function_privilege('service_role',v_oid,'EXECUTE') THEN
   RAISE EXCEPTION 'Authorized doctor activity access regression';
 END IF;
 IF strpos(pg_get_functiondef(v_oid),'Not authorized to read this doctor activity')=0 THEN
   RAISE EXCEPTION 'Existing server-side doctor ownership guard absent';
 END IF;
END $test$;
