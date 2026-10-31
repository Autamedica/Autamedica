-- Fail closed when physician lookup or JWT role is absent.
-- Only the existing ownership condition changes; all other logic and ACLs are preserved.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

DO $hardening$
DECLARE
  item record;
  function_oid oid;
  definition text;
  old_guard text;
  new_guard text;
  original_acl aclitem[];
  original_attributes jsonb;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('public.doctor_heartbeat(uuid)', 'v_doctor_id'),
    ('public.claim_pharmacy_request_tier(uuid,uuid)', 'v_resolved_doc_id'),
    ('public.set_doctor_duty_status(uuid,boolean,public.dispatch_tier_category[])', 'v_resolved_doc_id')
  ) AS targets(signature, doctor_variable)
  LOOP
    function_oid := to_regprocedure(item.signature);
    IF function_oid IS NULL THEN
      RAISE EXCEPTION 'Required dispatch RPC missing: %', item.signature;
    END IF;
    SELECT proacl INTO original_acl FROM pg_proc WHERE oid = function_oid;
    SELECT jsonb_build_object('owner',proowner,'definer',prosecdef,'config',proconfig,'args',proargtypes::text,'result',prorettype) INTO original_attributes FROM pg_proc WHERE oid=function_oid;
    definition := pg_get_functiondef(function_oid);
    old_guard := format(
      'IF auth.role() != ''service_role'' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = %s) != auth.uid()) THEN',
      item.doctor_variable
    );
    new_guard := format(
      'IF auth.role() IS DISTINCT FROM ''service_role'' AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = %s) IS DISTINCT FROM auth.uid()) THEN',
      item.doctor_variable
    );
    IF strpos(definition, old_guard) > 0 THEN
      IF (length(definition) - length(replace(definition, old_guard, ''))) / length(old_guard) <> 1 THEN
        RAISE EXCEPTION 'Ambiguous guard in %', item.signature;
      END IF;
      EXECUTE replace(definition, old_guard, new_guard);
    ELSIF strpos(definition, new_guard) = 0 THEN
      RAISE EXCEPTION 'Unexpected dispatch RPC definition: %', item.signature;
    END IF;
    IF (SELECT jsonb_build_object('owner',proowner,'definer',prosecdef,'config',proconfig,'args',proargtypes::text,'result',prorettype) FROM pg_proc WHERE oid=function_oid) IS DISTINCT FROM original_attributes
       OR (SELECT proacl FROM pg_proc WHERE oid = function_oid) IS DISTINCT FROM original_acl
       OR strpos(pg_get_functiondef(function_oid), new_guard) = 0 THEN
      RAISE EXCEPTION 'Dispatch guard/ACL invariant failed: %', item.signature;
    END IF;
  END LOOP;
END;
$hardening$;
