-- Disposable-only behavioral smoke test for persistent, market-isolated queue.
-- This fixture contains synthetic records and rolls back all changes.
BEGIN;

-- Stub outbound push in the throwaway local database. No external traffic.
CREATE OR REPLACE FUNCTION app_private.send_authenticated_dispatch_push(
  p_user_id uuid,p_title text,p_body text,p_data jsonb
) RETURNS bigint LANGUAGE sql SECURITY DEFINER
SET search_path TO '' AS $mock_push$ SELECT 1::bigint $mock_push$;

DO $test$
DECLARE
  v_ar uuid;
  v_br uuid;
  v_doctor uuid := gen_random_uuid();
  v_doctor_user uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  -- No clinician online: the INSERT/dispatch trigger must leave both patients
  -- in a durable queue, without inventing a doctor or expiring the request.
  INSERT INTO public.pharmacy_dispatch_requests(
      patient_dni,patient_phone,patient_name,tier_requested,
      care_country,cloudflare_room_id,status)
  VALUES ('CI-AR','0000000000','Synthetic AR','general',
      'AR','ci-queue-ar-'||gen_random_uuid()::text,'searching')
  RETURNING id INTO v_ar;

  INSERT INTO public.pharmacy_dispatch_requests(
      patient_cpf,patient_phone,patient_name,tier_requested,
      care_country,cloudflare_room_id,status)
  VALUES ('00000000000','0000000000','Synthetic BR','general',
      'BR','ci-queue-br-'||gen_random_uuid()::text,'searching')
  RETURNING id INTO v_br;

  IF (SELECT status::text FROM public.pharmacy_dispatch_requests WHERE id=v_ar) <> 'searching'
     OR (SELECT status::text FROM public.pharmacy_dispatch_requests WHERE id=v_br) <> 'searching'
     OR EXISTS (SELECT 1 FROM public.pharmacy_dispatch_requests
                WHERE id IN (v_ar,v_br) AND search_timeout_at IS NOT NULL)
  THEN
    RAISE EXCEPTION 'No-doctor search must persist in its country-specific queue';
  END IF;

  SELECT public.match_dispatch_doctors(v_ar) INTO v_result;
  IF v_result->>'code' <> 'WAITING_FOR_COUNTRY_DOCTOR' THEN
    RAISE EXCEPTION 'Unexpected no-doctor result: %',v_result;
  END IF;

  -- Activate one synthetic AR physician; his live heartbeat must trigger
  -- precisely an AR offer and must NEVER target the BR request.
  INSERT INTO auth.users(id,email)
    VALUES(v_doctor_user,'queue-ci-'||v_doctor_user||'@example.invalid');
  INSERT INTO public.doctors(
      id,user_id,license_type,license_number,specialty,active,care_country)
    VALUES(v_doctor,v_doctor_user,'MN','CI-TEST-123','Medicina General',true,'AR');

  INSERT INTO public.doctor_duty_status(
      doctor_id,is_on_duty,last_heartbeat_at,duty_started_at)
    VALUES(v_doctor,true,NOW(),NOW());

  IF NOT EXISTS(
       SELECT 1 FROM public.dispatch_offers o
       WHERE o.dispatch_request_id=v_ar AND o.doctor_id=v_doctor
         AND o.status='pending' AND o.expires_at>NOW()
     )
     OR EXISTS(
       SELECT 1 FROM public.dispatch_offers o
       WHERE o.dispatch_request_id=v_br
     )
  THEN
    RAISE EXCEPTION 'Doctor activation did not assign only the AR waiting patient';
  END IF;

  IF (SELECT status::text FROM public.pharmacy_dispatch_requests WHERE id=v_ar) <> 'searching'
     OR (SELECT status::text FROM public.pharmacy_dispatch_requests WHERE id=v_br) <> 'searching'
  THEN
    RAISE EXCEPTION 'An offer must not remove a patient from the queue before acceptance';
  END IF;
END;
$test$;

ROLLBACK;
