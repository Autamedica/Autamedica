-- Production ledger version: 20261031054700.
-- Restrict eligibility checks to the target patient's own identity or a
-- trusted service-role invocation. Six existing authenticated community RLS
-- policies already enforce patient ownership and remain unchanged.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

DO $hardening$
DECLARE
  v_oid oid := to_regprocedure('public.community_group_allowed_for_patient(uuid,uuid)');
  v_def text;
  v_old text := 'ON patients.id = target_patient_id';
  v_new text := E'ON patients.id = target_patient_id\n        AND (patients.user_id = auth.uid() OR (auth.jwt() ->> ''role'') = ''service_role'')';
  v_acl aclitem[];
  v_attrs jsonb;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Community eligibility function absent; abort';
  END IF;
  SELECT pg_get_functiondef(v_oid), proacl,
         jsonb_build_object('owner',proowner,'definer',prosecdef,'config',proconfig,
                            'args',proargtypes::text,'result',prorettype)
  INTO v_def,v_acl,v_attrs FROM pg_proc WHERE oid=v_oid;

  IF strpos(v_def,v_old)=0
     OR (length(v_def)-length(replace(v_def,v_old,'')))/length(v_old) <> 1
     OR strpos(v_def,'SECURITY DEFINER')=0 THEN
    RAISE EXCEPTION 'Unexpected eligibility implementation; abort';
  END IF;

  EXECUTE replace(v_def,v_old,v_new);

  IF (SELECT proacl FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_acl
     OR (SELECT jsonb_build_object('owner',proowner,'definer',prosecdef,'config',proconfig,
                                   'args',proargtypes::text,'result',prorettype)
           FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_attrs
     OR strpos(pg_get_functiondef(v_oid),v_new)=0 THEN
    RAISE EXCEPTION 'Eligibility guard/privilege invariant failed; abort';
  END IF;
END;
$hardening$;
