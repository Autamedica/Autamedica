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
  v_admin_user uuid := gen_random_uuid();
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
  INSERT INTO auth.users(id,email,raw_user_meta_data)
    VALUES(v_admin_user,'queue-admin-ci-'||v_admin_user||'@example.invalid','{"role":"admin"}'::jsonb);
  UPDATE public.profiles SET active=true WHERE user_id=v_admin_user;

  INSERT INTO auth.users(id,email)
    VALUES(v_doctor_user,'queue-ci-'||v_doctor_user||'@example.invalid');
  INSERT INTO public.doctors(
      id,user_id,license_type,license_number,specialty,active)
    VALUES(v_doctor,v_doctor_user,'MN','CI-TEST-123','Medicina General',true);
  IF (SELECT care_country FROM public.doctors WHERE id=v_doctor) <> 'AR' THEN
    RAISE EXCEPTION 'Generated doctor country mismatch';
  END IF;

  -- The new matcher requires explicit service-tier enrollment. Only an
  -- authenticated platform administrator may enable the doctor's tiers.
  PERFORM set_config('request.jwt.claim.sub',v_admin_user::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  UPDATE public.doctors SET enabled_service_tiers=ARRAY['general']::text[] WHERE id=v_doctor;
  PERFORM set_config('request.jwt.claim.sub',v_doctor_user::text,true);
  PERFORM set_config('request.jwt.claim.role','service_role',true);

  INSERT INTO public.doctor_licenses (doctor_id,license_number,license_type,province,status)
  VALUES (v_doctor,'CI-TEST-123','MN','CABA','active');

  -- Without explicit Admin/SISA approval the physician must NOT activate
  -- the guard or receive a clinical offer, even if the doctor row is active.
  UPDATE public.profiles
  SET active=true, role='doctor', sss_validation_status='pending_review'
  WHERE user_id=v_doctor_user;

  IF app_private.is_doctor_dispatch_approved(v_doctor) THEN
    RAISE EXCEPTION 'Pending doctor incorrectly approved';
  END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  BEGIN
    PERFORM public.set_doctor_duty_status(v_doctor,true,ARRAY['general']::public.dispatch_tier_category[]);
    RAISE EXCEPTION 'Pending doctor was able to activate clinical guard';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- Expected DOCTOR_PENDING_CLINICAL_APPROVAL.
  END;

  -- Admin approval changes only professional validation, never creates a
  -- new account. The same doctor may now become available.
  UPDATE public.profiles
  SET sss_validation_status='valid'
  WHERE user_id=v_doctor_user;

  IF NOT app_private.is_doctor_dispatch_approved(v_doctor) THEN
    RAISE EXCEPTION 'Approved doctor still refused by clinical authorization predicate';
  END IF;

  INSERT INTO public.doctor_duty_status(
      doctor_id,is_on_duty,active_tiers,last_heartbeat_at,duty_started_at)
    VALUES(v_doctor,true,ARRAY['general']::public.dispatch_tier_category[],NOW(),NOW());

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

  -- AR clinical offers must never accidentally carry BRL pricing.
  IF EXISTS (
    SELECT 1 FROM public.dispatch_offers
    WHERE dispatch_request_id=v_ar AND price_brl IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'AR doctor offer contained BRL pricing';
  END IF;

  -- Recovery hashes are strictly server-only, and must be revoked when the
  -- original guest leaves the waiting queue.
  IF has_table_privilege('anon','public.pharmacy_guest_dispatch_sessions','SELECT')
     OR has_table_privilege('authenticated','public.pharmacy_guest_dispatch_sessions','SELECT')
  THEN
    RAISE EXCEPTION 'Guest recovery credential hashes are exposed to clients';
  END IF;

  INSERT INTO public.pharmacy_guest_dispatch_sessions(request_id,token_sha256)
    VALUES(v_br,repeat('a',64));
  UPDATE public.pharmacy_dispatch_requests SET status='cancelled'
    WHERE id=v_br;
  IF NOT EXISTS (
    SELECT 1 FROM public.pharmacy_guest_dispatch_sessions
    WHERE request_id=v_br AND revoked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Guest recovery credential was not revoked on cancellation';
  END IF;

  -- A valid offer must be claimable by the eligible AR physician. The
  -- patient stays waiting until this acceptance, then becomes 'matched'.
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  SELECT public.claim_pharmacy_request_tier(v_doctor,v_ar) INTO v_result;
  IF COALESCE(v_result->>'success','false') <> 'true'
    OR (SELECT status::text FROM public.pharmacy_dispatch_requests WHERE id=v_ar) <> 'matched'
    OR (SELECT assigned_doctor_id FROM public.pharmacy_dispatch_requests WHERE id=v_ar) <> v_doctor
  THEN
    RAISE EXCEPTION 'AR offer acceptance failed: %',v_result;
  END IF;

  UPDATE public.pharmacy_dispatch_requests SET status='in_call'
  WHERE id=v_ar AND status='matched';

  IF (SELECT status::text FROM public.pharmacy_dispatch_requests WHERE id=v_ar) <> 'in_call' THEN
    RAISE EXCEPTION 'Accepted AR patient did not become video-joinable';
  END IF;
END;
$test$;

ROLLBACK;
