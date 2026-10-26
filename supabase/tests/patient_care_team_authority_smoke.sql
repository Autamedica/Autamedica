-- Care team ACL: no unrelated doctor may nominate a different doctor.
BEGIN;
DO $test$
DECLARE
  v_insert text;
  v_update text;
  v_guard text;
  v_helper text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_insert FROM pg_policy
  WHERE polrelid = 'public.patient_care_team'::regclass
    AND polname = 'patient_care_team_insert_scoped';
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_update FROM pg_policy
  WHERE polrelid = 'public.patient_care_team'::regclass
    AND polname = 'patient_care_team_update_scoped';
  SELECT pg_get_functiondef('public.add_to_care_team(uuid,uuid,text,text)'::regprocedure) INTO v_guard;
  SELECT pg_get_functiondef('public.can_self_assign_care_team(uuid,uuid)'::regprocedure) INTO v_helper;

  IF v_insert IS NULL OR v_update IS NULL
    OR position('can_self_assign_care_team' IN v_insert) = 0
    OR position('can_self_assign_care_team' IN v_update) = 0
  THEN
    RAISE EXCEPTION 'Care team policies allow unverified doctor association';
  END IF;
  IF position('care_team_access_denied' IN v_guard) = 0
     OR position('can_self_assign_care_team' IN v_guard) = 0
     OR position('appointments' IN v_helper) = 0
     OR position('d.user_id' IN v_helper) = 0
     OR position('PENDING' IN v_helper) = 0
  THEN
    RAISE EXCEPTION 'Care team RPC does not establish doctor ownership and clinical relationship';
  END IF;
  IF has_function_privilege('anon', 'public.add_to_care_team(uuid,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.can_self_assign_care_team(uuid,uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Anonymous client can manipulate care team';
  END IF;
END;
$test$;
ROLLBACK;
