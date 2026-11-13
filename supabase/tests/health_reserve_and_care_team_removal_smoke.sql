-- Immutable authorization smoke checks against disposable local database.
BEGIN;
DO $smoke$
DECLARE v_balance text; v_remove text;
BEGIN
  SELECT pg_get_functiondef('public.patient_health_reserve_get_balance(uuid)'::regprocedure)
  INTO v_balance;
  SELECT pg_get_functiondef('public.remove_from_care_team(uuid,uuid,text)'::regprocedure)
  INTO v_remove;

  IF position('health_reserve_access_denied' IN v_balance) = 0
    OR position('p.user_id = (SELECT auth.uid())' IN v_balance) = 0
    OR position('v_patient_id := p_patient_id' IN v_balance) = 0
  THEN RAISE EXCEPTION 'Health reserve missing patient ownership guard'; END IF;

  IF position('care_team_removal_access_denied' IN v_remove) = 0
    OR position('can_self_assign_care_team' IN v_remove) = 0
    OR position('is_system_admin()' IN v_remove) = 0
  THEN RAISE EXCEPTION 'Care-team removal missing clinical authority guard'; END IF;

  IF has_function_privilege('anon','public.patient_health_reserve_get_balance(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.ensure_patient_health_reserve(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.ensure_patient_health_reserve(uuid)','EXECUTE')
    OR has_function_privilege('anon','public.remove_from_care_team(uuid,uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Privileged reserve or care-team RPC callable anonymously'; END IF;

  IF NOT has_function_privilege('authenticated','public.patient_health_reserve_get_balance(uuid)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.ensure_patient_health_reserve(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.remove_from_care_team(uuid,uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Legitimate patient/doctor paths revoked'; END IF;

  -- This must fail *before* ensure_patient_health_reserve writes any row.
  BEGIN
    PERFORM public.patient_health_reserve_get_balance(
      '00000000-0000-0000-0000-000000000001'::uuid);
    RAISE EXCEPTION 'UNAUTHORIZED_BALANCE_READ_NOT_REJECTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$smoke$;
ROLLBACK;
