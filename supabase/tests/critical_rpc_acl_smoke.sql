-- Disposable/local-only regression tests for the 2026-10-26 RPC ACL migration.
-- No patient/doctor records are inserted or modified.
BEGIN;

DO $test$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.drain_notification_queue(integer)',
    'public.fn_cleanup_old_audit_logs(integer)',
    'public.cancel_pharmacy_consultation_request(uuid,text)',
    'public.pay_appointment_with_patient_wallet(uuid,uuid,text)',
    'public.ensure_patient_wallet(uuid)',
    'public.redeem_reserve_benefit(uuid,uuid,integer,text)'
  ]
  LOOP
    IF pg_catalog.has_function_privilege('anon', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon must not execute %', v_sig;
    END IF;
    IF pg_catalog.has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated must not directly execute %', v_sig;
    END IF;
    IF NOT pg_catalog.has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must still execute %', v_sig;
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege(
    'anon', 'public.replace_weekly_availability(uuid,jsonb)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon must not replace weekly availability';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'authenticated', 'public.replace_weekly_availability(uuid,jsonb)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated doctors must retain an authorized RPC entrypoint';
  END IF;
END;
$test$;

-- No JWT / no doctor ownership: cannot change even an empty availability schedule.
DO $test$
BEGIN
  BEGIN
    PERFORM * FROM public.replace_weekly_availability(
      '00000000-0000-4000-8000-000000000001'::uuid, '[]'::jsonb
    );
    RAISE EXCEPTION 'availability check allowed an anonymous operation';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- expected SQLSTATE 42501
  END;
END;
$test$;

ROLLBACK;
