-- Only doctor/administrator may change approved call fields via Data API.
-- Synthetic invocation requires full Auth fixture; replay asserts the trigger.
BEGIN;
DO $test$
DECLARE v_guard text; v_trigger_count integer;
BEGIN
  SELECT pg_get_functiondef('public.guard_pharmacy_dispatch_update()'::regprocedure) INTO v_guard;
  SELECT count(*) INTO v_trigger_count FROM pg_trigger
  WHERE tgrelid='public.pharmacy_dispatch_requests'::regclass
    AND tgname='trg_guard_pharmacy_dispatch_update'
    AND NOT tgisinternal;

  IF v_trigger_count <> 1 THEN
    RAISE EXCEPTION 'Dispatch update guard trigger missing';
  END IF;
  IF position('SECURITY INVOKER' IN v_guard)=0
    OR position('dispatch_update_access_denied' IN v_guard)=0
    OR position('dispatch_protected_fields_immutable' IN v_guard)=0
    OR position('dispatch_invalid_status_transition' IN v_guard)=0
    OR position('OLD.assigned_doctor_id' IN v_guard)=0
  THEN
    RAISE EXCEPTION 'Unsafe direct dispatch update permissions';
  END IF;
END;
$test$;
ROLLBACK;
