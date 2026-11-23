-- Contract test for doctor_heartbeat's active-duty ROW_COUNT semantics.
-- Executed only against the disposable local database after migration replay.
DO $test$
DECLARE
  v_definition text;
  v_normalized text;
  v_duty_update integer;
  v_row_count integer;
  v_zero_guard integer;
  v_session_update integer;
BEGIN
  SELECT pg_get_functiondef('public.doctor_heartbeat(uuid)'::regprocedure)
    INTO v_definition;
  v_normalized := upper(v_definition);

  v_duty_update := position('UPDATE PUBLIC.DOCTOR_DUTY_STATUS' IN v_normalized);
  v_row_count := position('GET DIAGNOSTICS V_UPDATED_ROWS = ROW_COUNT' IN v_normalized);
  v_zero_guard := position('IF V_UPDATED_ROWS = 0 THEN' IN v_normalized);
  v_session_update := position('UPDATE PUBLIC.DOCTOR_ON_DUTY_SESSIONS' IN v_normalized);

  IF v_duty_update = 0 OR v_row_count = 0 OR v_zero_guard = 0 OR v_session_update = 0 THEN
    RAISE EXCEPTION 'doctor_heartbeat must check ROW_COUNT from doctor_duty_status before updating sessions';
  END IF;
  IF NOT (v_duty_update < v_row_count AND v_row_count < v_zero_guard AND v_zero_guard < v_session_update) THEN
    RAISE EXCEPTION 'doctor_heartbeat ROW_COUNT guard must precede the session update';
  END IF;
  IF position('''SUCCESS'', FALSE' IN v_normalized) = 0
     OR position('''CODE'', ''DOCTOR_NOT_ON_DUTY''' IN v_normalized) = 0 THEN
    RAISE EXCEPTION 'doctor_heartbeat must return success=false when no duty row was updated';
  END IF;
  IF position('AUTH.UID()' IN v_normalized) = 0
     OR position('APP_PRIVATE.IS_DOCTOR_DISPATCH_APPROVED' IN v_normalized) = 0 THEN
    RAISE EXCEPTION 'doctor_heartbeat authorization and clinical approval gates must remain intact';
  END IF;
END;
$test$;
