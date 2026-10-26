-- Only doctor/administrator may change approved call fields via Data API.
-- Synthetic invocation requires full Auth fixture; replay asserts the trigger.
BEGIN;
DO $test$
DECLARE v_guard text; v_trigger_count integer; v_is_definer boolean;
BEGIN
  SELECT pg_get_functiondef('public.guard_pharmacy_dispatch_update()'::regprocedure) INTO v_guard;
  SELECT count(*) INTO v_trigger_count FROM pg_trigger
  WHERE tgrelid='public.pharmacy_dispatch_requests'::regclass
    AND tgname='trg_guard_pharmacy_dispatch_update'
    AND NOT tgisinternal;

  SELECT p.prosecdef INTO v_is_definer FROM pg_proc p
  WHERE p.oid = 'public.guard_pharmacy_dispatch_update()'::regprocedure;
  IF COALESCE(v_is_definer, true) THEN
    RAISE EXCEPTION 'Direct dispatch UPDATE guard must execute as the invoker';
  END IF;

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'Dispatch update guard trigger missing';
  END IF;
  IF position('dispatch_update_access_denied' IN v_guard)=0
    OR position('dispatch_protected_fields_immutable' IN v_guard)=0
    OR position('dispatch_invalid_status_transition' IN v_guard)=0
    OR position('OLD.assigned_doctor_id' IN v_guard)=0
  THEN
    RAISE EXCEPTION 'Unsafe direct dispatch update permissions';
  END IF;
END;
$test$;
ROLLBACK;
