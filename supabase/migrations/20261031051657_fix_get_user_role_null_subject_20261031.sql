-- Applied to Supabase production as version 20261031051657.
-- Preserve the original definition, owner, ACL, function attributes and search_path.
-- Fix SQL NULL semantics in authorization: an anonymous caller must not
-- enumerate another user's role using get_user_role(target_user_id).
-- Authorized self lookups, platform/org admins and service_role remain supported.
SET lock_timeout = '3s';
SET statement_timeout = '20s';

DO $hardening$
DECLARE
  v_oid oid := to_regprocedure('public.get_user_role(uuid)');
  v_def text;
  v_old text := 'IF target_user_id != auth.uid() THEN';
  v_new text := 'IF target_user_id IS DISTINCT FROM auth.uid() AND (auth.jwt() ->> ''role'') IS DISTINCT FROM ''service_role'' THEN';
  v_acl aclitem[];
  v_attributes jsonb;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'get_user_role(uuid) missing; abort';
  END IF;
  SELECT pg_get_functiondef(v_oid), proacl,
         jsonb_build_object('owner', proowner, 'definer', prosecdef, 'config', proconfig,
                            'args', proargtypes::text, 'result', prorettype)
    INTO v_def, v_acl, v_attributes
    FROM pg_proc WHERE oid = v_oid;
  IF strpos(v_def, v_old) = 0
     OR (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1
     OR strpos(v_def, 'SECURITY DEFINER') = 0 THEN
     RAISE EXCEPTION 'Unexpected get_user_role definition; abort';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
  IF (SELECT proacl FROM pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_acl
     OR (SELECT jsonb_build_object('owner', proowner, 'definer', prosecdef,
                                  'config', proconfig, 'args', proargtypes::text,
                                  'result', prorettype) FROM pg_proc WHERE oid=v_oid)
        IS DISTINCT FROM v_attributes
     OR strpos(pg_get_functiondef(v_oid), v_new) = 0 THEN
    RAISE EXCEPTION 'get_user_role privilege or definition invariant failed; abort';
  END IF;
END;
$hardening$;
