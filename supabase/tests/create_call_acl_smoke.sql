-- Run on a disposable Supabase database after migrations are replayed.
-- No data mutations, no notifications and no real patient identifiers.
DO $audit$
DECLARE
  v_fn oid := 'public.create_call(uuid,uuid,uuid)'::regprocedure::oid;
  v_definition text;
BEGIN
  IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'create_call: anon must not have EXECUTE';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'create_call: expected clinical and backend callers cannot EXECUTE';
  END IF;

  IF pg_catalog.has_function_privilege(
    'anon', 'public.can_start_call(uuid,uuid,uuid)', 'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'authenticated', 'public.can_start_call(uuid,uuid,uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'can_start_call: helper must be authenticated-only';
  END IF;

  IF public.can_start_call(NULL::uuid, NULL::uuid, NULL::uuid) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'can_start_call: invalid participants were accepted';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(v_fn) INTO v_definition;

  IF v_definition NOT LIKE '%v_auth_user%'
     OR v_definition NOT LIKE '%a.doctor_id = p_doctor_id%'
     OR v_definition NOT LIKE '%a.patient_id = p_patient_id%'
     OR v_definition NOT LIKE '%pct.doctor_id = p_doctor_id%'
     OR v_definition NOT LIKE '%v_is_service_role%' THEN
    RAISE EXCEPTION 'create_call: mandatory participant authorization is missing';
  END IF;

  -- Reject invalid IDs before any INSERT, including for a privileged caller.
  BEGIN
    PERFORM * FROM public.create_call(NULL::uuid, NULL::uuid, NULL::uuid);
    RAISE EXCEPTION 'create_call: null doctor/patient was accepted';
  EXCEPTION
    WHEN SQLSTATE '22023' THEN
      RAISE NOTICE 'create_call: invalid participants rejected';
  END;

  RAISE NOTICE 'create_call: permission and authorization smoke checks passed';
END;
$audit$;

-- Behavioral regression test. Disposable CI database ONLY; all fixtures roll back.
BEGIN;
-- Only in disposable CI: suppress application notification/audit triggers;
-- ordinary FK constraints stay enabled, and the transaction rolls back.
ALTER TABLE public.profiles DISABLE TRIGGER USER;
ALTER TABLE public.doctors DISABLE TRIGGER USER;
ALTER TABLE public.appointments DISABLE TRIGGER USER;
DO $guest_calls$
DECLARE
  v_user uuid := gen_random_uuid();
  v_doctor uuid := gen_random_uuid();
  v_other_doctor uuid := gen_random_uuid();
  v_patient uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_registered uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_deleted uuid := gen_random_uuid();
  v_cancelled uuid := gen_random_uuid();
  v_inperson uuid := gen_random_uuid();
  v_appointment uuid;
  v_call record;
  v_before bigint;
BEGIN
  -- Create a real disposable auth identity so the doctor FK remains enforced.
  INSERT INTO auth.users(id, instance_id, aud, role, email, created_at, updated_at)
  VALUES (v_user, '00000000-0000-0000-0000-000000000000',
          'authenticated', 'authenticated', 'ci-call-' || v_user || '@example.invalid',
          now(), now());
  INSERT INTO public.profiles(user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.doctors(id,user_id,license_number,specialty,active)
  VALUES (v_doctor,v_user,'TEST-' || v_doctor,'General',true),
         (v_other_doctor,NULL,'TEST-' || v_other_doctor,'General',true);
  INSERT INTO public.patients(id,active,care_country) VALUES(v_patient,true,'AR');
  -- Triggers are disabled in this isolated authorization fixture; explicitly
  -- supply a finite valid end_time so the atomic booking constraint remains active.
  INSERT INTO public.appointments(id,doctor_id,patient_id,start_time,end_time,type,status,deleted_at)
  VALUES
    (v_guest,v_doctor,NULL,now() + interval '1 day',now() + interval '1 day 30 minutes','telemedicine','scheduled',NULL),
    (v_registered,v_doctor,v_patient,now() + interval '2 days',now() + interval '2 days 30 minutes','telemedicine','confirmed',NULL),
    (v_other,v_other_doctor,NULL,now() + interval '3 days',now() + interval '3 days 30 minutes','telemedicine','scheduled',NULL),
    (v_deleted,v_doctor,NULL,now() + interval '4 days',now() + interval '4 days 30 minutes','telemedicine','scheduled',now()),
    (v_cancelled,v_doctor,NULL,now() + interval '5 days',now() + interval '5 days 30 minutes','telemedicine','cancelled',NULL),
    (v_inperson,v_doctor,NULL,now() + interval '6 days',now() + interval '6 days 30 minutes','consultation','scheduled',NULL);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);

  IF public.can_start_call(v_doctor,NULL,v_guest) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Authorized guest appointment rejected';
  END IF;
  -- Ownership alone no longer authorizes a guest with no established care market.
  BEGIN
    PERFORM * FROM public.create_call(v_doctor,NULL,v_guest);
    RAISE EXCEPTION 'Guest without a country was allowed to start clinical care';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  IF public.can_start_call(v_doctor,v_patient,v_registered) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Registered appointment regressed';
  END IF;
  PERFORM * FROM public.create_call(v_doctor,v_patient,v_registered);
  SELECT count(*) INTO v_before FROM public.calls;

  FOREACH v_appointment IN ARRAY ARRAY[v_other,v_deleted,v_cancelled,v_inperson,v_registered] LOOP
    IF public.can_start_call(v_doctor,NULL,v_appointment) IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'Unauthorized guest appointment accepted by helper';
    END IF;
    BEGIN
      PERFORM * FROM public.create_call(v_doctor,NULL,v_appointment);
      RAISE EXCEPTION 'Unauthorized guest appointment accepted by RPC';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  IF public.can_start_call(v_doctor,NULL,NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Guest without appointment accepted by helper';
  END IF;
  BEGIN
    PERFORM * FROM public.create_call(v_doctor,NULL,NULL);
    RAISE EXCEPTION 'Guest without appointment accepted by RPC';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.create_call(v_doctor,v_patient,v_guest);
    RAISE EXCEPTION 'Patient substituted on guest appointment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  IF public.can_start_call(v_doctor,NULL,v_guest) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Other user passed helper';
  END IF;
  BEGIN
    PERFORM * FROM public.create_call(v_doctor,NULL,v_guest);
    RAISE EXCEPTION 'Other user impersonated doctor';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  BEGIN
    PERFORM * FROM public.create_call(v_doctor,NULL,v_other);
    RAISE EXCEPTION 'Backend bypassed appointment ownership';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF (SELECT count(*) FROM public.calls) <> v_before THEN
    RAISE EXCEPTION 'Rejected calls left persisted rows';
  END IF;
  RAISE NOTICE 'Guest and registered call authorization regression tests passed';
END;
$guest_calls$;
ALTER TABLE public.appointments ENABLE TRIGGER USER;
ALTER TABLE public.doctors ENABLE TRIGGER USER;
ALTER TABLE public.profiles ENABLE TRIGGER USER;
ROLLBACK;

