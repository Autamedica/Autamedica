-- Replayed only against disposable CI postgres, no patient data mutations.
BEGIN;
DO $smoke$
DECLARE
  v_sig text;
  v_fn regprocedure;
  v_qual text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.drain_notification_queue(integer)',
    'public.fn_cleanup_old_audit_logs(integer)',
    'public.redeem_reserve_benefit(uuid,uuid,integer,text)',
    'public.create_patient_alert(uuid,text,uuid,text,text,text,jsonb,uuid)',
    'public.enqueue_notification(uuid,text,text,text,text,jsonb,text,timestamp with time zone)',
    'public.ensure_dispatch_patient(uuid,text,text)',
    'public.expire_stale_dispatch_requests()',
    'public.get_user_audit_log(uuid,integer)',
    'public.match_dispatch_doctors(uuid)',
    'public.advance_expired_dispatch_offers()',
    'public.ensure_patient_wallet(uuid)',
    'public.pay_appointment_with_patient_wallet(uuid,uuid,text)'
  ] LOOP
    v_fn := to_regprocedure(v_sig);
    IF v_fn IS NOT NULL THEN
      IF has_function_privilege('anon', v_fn, 'EXECUTE')
         OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
      THEN
        RAISE EXCEPTION 'Critical privileged RPC executable by client: %', v_sig;
      END IF;
      IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'Internal service role missing execute: %', v_sig;
      END IF;
    END IF;
  END LOOP;

  -- Guest cancellation is intentionally public: the unguessable request UUID
  -- is its capability, and the function only transitions pending requests.
  v_fn := to_regprocedure('public.cancel_pharmacy_consultation_request(uuid,text)');
  IF v_fn IS NULL THEN
    RAISE EXCEPTION 'Public guest cancellation RPC is missing';
  END IF;
  IF NOT has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
     OR position('p_request_id' IN pg_get_functiondef(v_fn)) = 0
     OR position('status=''pending''' IN pg_get_functiondef(v_fn)) = 0
  THEN
    RAISE EXCEPTION 'Public guest cancellation contract regressed';
  END IF;

  IF has_function_privilege('anon','public.claim_dispatch_offer(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.claim_dispatch_offer(uuid)','EXECUTE')
  THEN
    RAISE EXCEPTION 'Dispatch offer claim privileges regressed';
  END IF;

  IF has_function_privilege('anon','public.patient_wallet_get_balance(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.patient_wallet_get_balance(uuid)','EXECUTE')
    OR position('patient_wallet_access_denied' in pg_get_functiondef(
      'public.patient_wallet_get_balance(uuid)'::regprocedure)) = 0
  THEN
    RAISE EXCEPTION 'Patient balance owner guard missing';
  END IF;

  IF has_function_privilege('anon','public.replace_weekly_availability(uuid,jsonb)','EXECUTE')
    OR position('availability_access_denied' in pg_get_functiondef(
      'public.replace_weekly_availability(uuid,jsonb)'::regprocedure)) = 0
  THEN
    RAISE EXCEPTION 'Doctor weekly availability guard missing';
  END IF;

  IF position('doctor_not_clinically_eligible' in pg_get_functiondef(
    'public.claim_dispatch_offer(uuid)'::regprocedure)) = 0
  THEN
    RAISE EXCEPTION 'Doctor credential guard missing on pharmacy claim';
  END IF;

  IF position('care_team_access_denied' in pg_get_functiondef(
    'public.add_to_care_team(uuid,uuid,text,text)'::regprocedure)) = 0
  THEN
    RAISE EXCEPTION 'Clinical team association guard missing';
  END IF;

  IF position('dispatch_protected_fields_immutable' in pg_get_functiondef(
    'public.guard_pharmacy_dispatch_update()'::regprocedure)) = 0
  THEN
    RAISE EXCEPTION 'Clinical dispatch immutability guard missing';
  END IF;

  SELECT pg_get_expr(polwithcheck,polrelid) INTO v_qual FROM pg_policy
    WHERE polrelid='public.pharmacy_dispatch_requests'::regclass
      AND polname='pharmacy_dispatch_requests_insert_kiosk_or_owner';
  -- Anonymous users cannot INSERT directly. Authenticated requests must
  -- carry their own verified user ID, never a user ID supplied by a kiosk.
  IF has_table_privilege('anon','public.pharmacy_dispatch_requests','INSERT')
    OR v_qual IS NULL
    OR position('requested_by_user_id' IN v_qual) = 0
    OR position('auth.uid()' IN v_qual) = 0
    OR position('requested_by_user_id IS NULL' IN v_qual) > 0
  THEN
    RAISE EXCEPTION 'Kiosk spoof protection missing';
  END IF;
END
$smoke$;
ROLLBACK;
