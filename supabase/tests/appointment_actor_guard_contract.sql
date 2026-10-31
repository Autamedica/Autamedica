-- Contract check after the complete disposable schema replay.
DO $contract$
DECLARE v_oid oid := to_regprocedure('public.enforce_appointment_participant_updates()');
DECLARE v_definition text;
BEGIN
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Appointment actor function absent'; END IF;
  SELECT pg_get_functiondef(v_oid) INTO v_definition;
  IF (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) THEN
    RAISE EXCEPTION 'Actor guard must run as SECURITY INVOKER';
  END IF;
  IF position('NEW.doctor_id IS DISTINCT FROM OLD.doctor_id' IN v_definition)=0
    OR position('NEW.patient_id IS DISTINCT FROM OLD.patient_id' IN v_definition)=0
    OR position('public.get_my_doctor_id()' IN v_definition)=0
    OR position('public.get_my_patient_id()' IN v_definition)=0
    OR position('appointment_patient_transition_not_allowed' IN v_definition)=0
  THEN RAISE EXCEPTION 'Actor authorization or immutability guard absent'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.appointments'::regclass
      AND tgname='trg_appointment_actor_guard'
      AND NOT tgisinternal AND tgenabled <> 'D'
  ) THEN RAISE EXCEPTION 'Actor guard trigger absent/inactive'; END IF;
END $contract$;
