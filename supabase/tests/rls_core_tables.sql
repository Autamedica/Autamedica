-- Exercises row-level policies under the authenticated database role.
-- Run only against the disposable local Supabase database; all fixtures roll back.
BEGIN;

DO $setup$
DECLARE
  u_patient_a uuid := gen_random_uuid();
  u_patient_b uuid := gen_random_uuid();
  u_doctor_a uuid := gen_random_uuid();
  u_doctor_b uuid := gen_random_uuid();
  u_company uuid := gen_random_uuid();
  patient_a_id uuid := gen_random_uuid();
  patient_b_id uuid := gen_random_uuid();
  doctor_a_id uuid := gen_random_uuid();
  doctor_b_id uuid := gen_random_uuid();
  appt_a_id uuid := gen_random_uuid();
  appt_b_id uuid := gen_random_uuid();
  record_a_id uuid := gen_random_uuid();
  record_b_id uuid := gen_random_uuid();
  company_id uuid := gen_random_uuid();
  fixture_suffix text := replace(gen_random_uuid()::text, '-', '');
BEGIN
  DELETE FROM public.medical_records WHERE id IN (record_a_id, record_b_id);
  DELETE FROM public.appointments WHERE id IN (appt_a_id, appt_b_id);
  DELETE FROM public.doctors WHERE id IN (doctor_a_id, doctor_b_id);
  DELETE FROM public.patients WHERE id IN (patient_a_id, patient_b_id);
  DELETE FROM public.companies WHERE id = company_id;
  DELETE FROM public.profiles WHERE user_id IN (u_patient_a, u_patient_b, u_doctor_a, u_doctor_b, u_company);
  DELETE FROM auth.users WHERE id IN (u_patient_a, u_patient_b, u_doctor_a, u_doctor_b, u_company);

  INSERT INTO auth.users (id, email) VALUES
    (u_patient_a, 'rls_patient_a_' || fixture_suffix || '@test.com'),
    (u_patient_b, 'rls_patient_b_' || fixture_suffix || '@test.com'),
    (u_doctor_a, 'rls_doctor_a_' || fixture_suffix || '@test.com'),
    (u_doctor_b, 'rls_doctor_b_' || fixture_suffix || '@test.com'),
    (u_company, 'rls_company_' || fixture_suffix || '@test.com');

  -- Reuse the profile rows created by the auth bootstrap trigger.
  UPDATE public.profiles AS profile
  SET email = fixture.email, role = fixture.role, external_id = fixture.external_id
  FROM (VALUES
    (u_patient_a, 'rls_patient_a_' || fixture_suffix || '@test.com', 'patient', 'rls-pa-' || fixture_suffix),
    (u_patient_b, 'rls_patient_b_' || fixture_suffix || '@test.com', 'patient', 'rls-pb-' || fixture_suffix),
    (u_doctor_a, 'rls_doctor_a_' || fixture_suffix || '@test.com', 'doctor', 'rls-da-' || fixture_suffix),
    (u_doctor_b, 'rls_doctor_b_' || fixture_suffix || '@test.com', 'doctor', 'rls-db-' || fixture_suffix),
    (u_company, 'rls_company_' || fixture_suffix || '@test.com', 'company', 'rls-co-' || fixture_suffix)
  ) AS fixture(user_id, email, role, external_id)
  WHERE profile.user_id = fixture.user_id;

  -- The auth bootstrap may create patient rows for new users; assign stable fixture IDs to patient users.
  UPDATE public.patients SET id = patient_a_id WHERE user_id = u_patient_a;
  UPDATE public.patients SET id = patient_b_id WHERE user_id = u_patient_b;
  INSERT INTO public.patients (id, user_id)
  SELECT patient_a_id, u_patient_a WHERE NOT EXISTS (
    SELECT 1 FROM public.patients WHERE user_id = u_patient_a
  );
  INSERT INTO public.patients (id, user_id)
  SELECT patient_b_id, u_patient_b WHERE NOT EXISTS (
    SELECT 1 FROM public.patients WHERE user_id = u_patient_b
  );

  UPDATE public.doctors
  SET license_number = 'LIC-RLS-A-' || fixture_suffix, specialty = 'Cardiology', active = true
  WHERE user_id = u_doctor_a;
  SELECT COALESCE((SELECT id FROM public.doctors WHERE user_id = u_doctor_a), doctor_a_id)
  INTO doctor_a_id;
  UPDATE public.doctors
  SET license_number = 'LIC-RLS-B-' || fixture_suffix, specialty = 'Neurology', active = false
  WHERE user_id = u_doctor_b;
  SELECT COALESCE((SELECT id FROM public.doctors WHERE user_id = u_doctor_b), doctor_b_id)
  INTO doctor_b_id;
  INSERT INTO public.doctors (id, user_id, license_number, specialty, active)
  SELECT doctor_a_id, u_doctor_a, 'LIC-RLS-A-' || fixture_suffix, 'Cardiology', true
  WHERE NOT EXISTS (SELECT 1 FROM public.doctors WHERE user_id = u_doctor_a);

  -- Doctor A must represent a currently approved clinician under the clinical
  -- authorization gate: active AR credential, administrator-validated profile,
  -- and a matching active doctor_licenses row.
  UPDATE public.doctors
  SET license_type = 'MN', care_country = 'AR'
  WHERE id = doctor_a_id;
  UPDATE public.profiles
  SET active = true, sss_validation_status = 'valid'
  WHERE user_id = u_doctor_a;
  INSERT INTO public.doctor_licenses (doctor_id, license_number, license_type, status)
  VALUES (doctor_a_id, 'LIC-RLS-A-' || fixture_suffix, 'MN', 'active');
  INSERT INTO public.doctors (id, user_id, license_number, specialty, active)
  SELECT doctor_b_id, u_doctor_b, 'LIC-RLS-B-' || fixture_suffix, 'Neurology', false
  WHERE NOT EXISTS (SELECT 1 FROM public.doctors WHERE user_id = u_doctor_b);

  UPDATE public.patients SET care_country='AR' WHERE id IN (patient_a_id,patient_b_id);
  -- Seed the historical inactive-doctor appointment while the doctor is eligible.
  UPDATE public.doctors SET active=true WHERE id=doctor_b_id;
  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, status) VALUES
    (appt_a_id, patient_a_id, doctor_a_id, now() + interval '1 day', 'scheduled'),
    (appt_b_id, patient_b_id, doctor_b_id, now() + interval '2 days', 'scheduled');

  INSERT INTO public.medical_records (id, patient_id, doctor_id, appointment_id, type, title, content) VALUES
    (record_a_id, patient_a_id, doctor_a_id, appt_a_id, 'consultation', 'RLS Record A', '{"notes":"test a"}'::jsonb),
    (record_b_id, patient_b_id, doctor_b_id, appt_b_id, 'consultation', 'RLS Record B', '{"notes":"test b"}'::jsonb);

  UPDATE public.doctors SET active=false WHERE id=doctor_b_id;

  INSERT INTO public.companies (id, name, owner_profile_id, active) VALUES
    (company_id, 'RLS Test Company', u_company, false);
  PERFORM set_config('test.rls.patient_a_user', u_patient_a::text, true);
  PERFORM set_config('test.rls.patient_b_user', u_patient_b::text, true);
  PERFORM set_config('test.rls.doctor_a_user', u_doctor_a::text, true);
  PERFORM set_config('test.rls.doctor_b_user', u_doctor_b::text, true);
  PERFORM set_config('test.rls.company_user', u_company::text, true);
  PERFORM set_config('test.rls.patient_a_id', patient_a_id::text, true);
  PERFORM set_config('test.rls.patient_b_id', patient_b_id::text, true);
  PERFORM set_config('test.rls.doctor_a_id', doctor_a_id::text, true);
  PERFORM set_config('test.rls.doctor_b_id', doctor_b_id::text, true);
  PERFORM set_config('test.rls.appt_a_id', appt_a_id::text, true);
  PERFORM set_config('test.rls.appt_b_id', appt_b_id::text, true);
  PERFORM set_config('test.rls.record_a_id', record_a_id::text, true);
  PERFORM set_config('test.rls.record_b_id', record_b_id::text, true);
  PERFORM set_config('test.rls.company_id', company_id::text, true);
END;
$setup$;

-- Patient A: own rows visible; another patient's clinical data hidden.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls.patient_a_user'), 'role', 'authenticated')::text, true);
DO $patient_a$
DECLARE visible_count integer;
        affected_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.patients
    WHERE id=current_setting('test.rls.patient_a_id')::uuid;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: patient cannot read own patient row'; END IF;

  SELECT count(*) INTO visible_count FROM public.patients
    WHERE id=current_setting('test.rls.patient_b_id')::uuid;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: patient can read another patient'; END IF;

  SELECT count(*) INTO visible_count FROM public.appointments
    WHERE id=current_setting('test.rls.appt_a_id')::uuid;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: patient cannot read own appointment'; END IF;

  SELECT count(*) INTO visible_count FROM public.appointments
    WHERE id=current_setting('test.rls.appt_b_id')::uuid;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: patient can read another patient appointment'; END IF;

  SELECT count(*) INTO visible_count FROM public.medical_records
    WHERE id=current_setting('test.rls.record_a_id')::uuid;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: patient cannot read own medical record'; END IF;

  SELECT count(*) INTO visible_count FROM public.medical_records
    WHERE id=current_setting('test.rls.record_b_id')::uuid;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: patient can read another patient medical record'; END IF;

  UPDATE public.doctors SET specialty = specialty
    WHERE id=current_setting('test.rls.doctor_a_id')::uuid;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: patient updated doctor row'; END IF;
END;
$patient_a$;
RESET ROLE;

-- Doctor A: own rows and own appointment record visible; another doctor's data hidden.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls.doctor_a_user'), 'role', 'authenticated')::text, true);
DO $doctor_a$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.doctors
    WHERE id=current_setting('test.rls.doctor_a_id')::uuid;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: doctor cannot read own row'; END IF;

  SELECT count(*) INTO visible_count FROM public.doctors
    WHERE id=current_setting('test.rls.doctor_b_id')::uuid;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: doctor can read another inactive doctor'; END IF;

  SELECT count(*) INTO visible_count FROM public.appointments
    WHERE id=current_setting('test.rls.appt_a_id')::uuid;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: doctor cannot read assigned appointment'; END IF;

  SELECT count(*) INTO visible_count FROM public.appointments
    WHERE id=current_setting('test.rls.appt_b_id')::uuid;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: doctor can read another doctor appointment'; END IF;

  SELECT count(*) INTO visible_count FROM public.medical_records
    WHERE id=current_setting('test.rls.record_a_id')::uuid;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: doctor cannot read own medical record'; END IF;

  SELECT count(*) INTO visible_count FROM public.medical_records
    WHERE id=current_setting('test.rls.record_b_id')::uuid;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: doctor can read another doctor medical record'; END IF;
END;
$doctor_a$;
RESET ROLE;

-- Company owner: only the owned inactive company row is visible.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls.company_user'), 'role', 'authenticated')::text, true);
DO $company_owner$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.companies
    WHERE id=current_setting('test.rls.company_id')::uuid;
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: company owner cannot read owned company'; END IF;
END;
$company_owner$;
RESET ROLE;

-- Exercise scoped SECURITY DEFINER RPCs against real relationships while a different user probes them.
UPDATE public.profiles
SET role = 'admin'
WHERE user_id = current_setting('test.rls.doctor_a_user')::uuid;

UPDATE public.doctors SET active=true WHERE id=current_setting('test.rls.doctor_b_id')::uuid;
INSERT INTO public.patient_care_team (patient_id, doctor_id, role, active)
VALUES (
  current_setting('test.rls.patient_b_id')::uuid,
  current_setting('test.rls.doctor_b_id')::uuid,
  'primary',
  true
);
UPDATE public.doctors SET active=false WHERE id=current_setting('test.rls.doctor_b_id')::uuid;

INSERT INTO public.medical_record_authorizations (
  record_id, authorized_user_id, authorized_by_user_id, reason, valid_until
)
VALUES (
  current_setting('test.rls.record_b_id')::uuid,
  current_setting('test.rls.patient_b_user')::uuid,
  current_setting('test.rls.patient_a_user')::uuid,
  'RLS authorization guard smoke test',
  now() + interval '1 hour'
);

-- The production heartbeat table is not versioned in the migration history; create a minimal test-only shape.
CREATE TABLE IF NOT EXISTS public.doctor_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.doctor_heartbeats (doctor_id, created_at)
VALUES (current_setting('test.rls.doctor_b_id')::uuid, now() - interval '5 minutes');

-- A different patient cannot probe admin status, authorization, or relationships.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls.patient_a_user'), 'role', 'authenticated')::text, true);
DO $unrelated_patient$
DECLARE denied boolean := false;
BEGIN
  IF public.is_platform_or_org_admin(current_setting('test.rls.doctor_a_user')::uuid) THEN
    RAISE EXCEPTION 'SECURITY FAIL: caller can probe another user admin status';
  END IF;
  IF public.has_active_authorization(
    current_setting('test.rls.record_b_id')::uuid,
    current_setting('test.rls.patient_b_user')::uuid
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: caller can probe another user medical authorization';
  END IF;
  IF public.is_in_care_team(
    current_setting('test.rls.doctor_b_id')::uuid,
    current_setting('test.rls.patient_b_id')::uuid
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: caller can probe another care team relationship';
  END IF;
  IF public.doctor_can_chat_with_patient(
    current_setting('test.rls.doctor_b_id')::uuid,
    current_setting('test.rls.patient_b_id')::uuid
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: caller can probe another chat relationship';
  END IF;

  BEGIN
    PERFORM public.get_doctor_online_minutes(
      current_setting('test.rls.doctor_b_id')::uuid,
      now() - interval '1 hour',
      now()
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'SECURITY FAIL: caller can read another doctor activity';
  END IF;
END;
$unrelated_patient$;
RESET ROLE;

-- Participants retain access to their own relationship and authorization checks.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls.patient_b_user'), 'role', 'authenticated')::text, true);
DO $patient_participant$
BEGIN
  IF NOT public.has_active_authorization(current_setting('test.rls.record_b_id')::uuid) THEN
    RAISE EXCEPTION 'SECURITY FAIL: authorized patient cannot validate own authorization';
  END IF;
  IF NOT public.is_in_care_team(
    current_setting('test.rls.doctor_b_id')::uuid,
    current_setting('test.rls.patient_b_id')::uuid
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: patient cannot validate own care team relationship';
  END IF;
  IF NOT public.doctor_can_chat_with_patient(
    current_setting('test.rls.doctor_b_id')::uuid,
    current_setting('test.rls.patient_b_id')::uuid
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: patient cannot validate own chat relationship';
  END IF;
END;
$patient_participant$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls.doctor_b_user'), 'role', 'authenticated')::text, true);
DO $doctor_participant$
BEGIN
  IF public.get_doctor_online_minutes(
    current_setting('test.rls.doctor_b_id')::uuid,
    now() - interval '1 hour',
    now()
  ) <> 5 THEN
    RAISE EXCEPTION 'SECURITY FAIL: doctor cannot read own online activity';
  END IF;
END;
$doctor_participant$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('test.rls.doctor_a_user'), 'role', 'authenticated')::text, true);
DO $admin_participant$
BEGIN
  IF NOT public.is_platform_or_org_admin() THEN
    RAISE EXCEPTION 'SECURITY FAIL: admin cannot validate own role';
  END IF;
  IF NOT public.is_in_care_team(
    current_setting('test.rls.doctor_b_id')::uuid,
    current_setting('test.rls.patient_b_id')::uuid
  ) THEN
    RAISE EXCEPTION 'SECURITY FAIL: admin cannot inspect care team relationship';
  END IF;
END;
$admin_participant$;
RESET ROLE;

DO $privileges$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.auto_delete_expired_recordings()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: anon can execute legacy recording cleanup';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', 'public.auto_delete_expired_recordings()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: authenticated can execute legacy recording cleanup';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', 'public.auto_delete_expired_recordings()', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY FAIL: service role lost scheduler access';
  END IF;
END;
$privileges$;


-- CALL_INTEGRITY_BEGIN: synthetic calls inside the surrounding rollback transaction.
DO $call_fixture$
DECLARE call_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.calls(id, room_id, doctor_id, patient_id, status, created_at, accepted_at)
  VALUES (call_id, 'integrity-test-' || call_id::text,
    current_setting('test.rls.doctor_a_id')::uuid,
    current_setting('test.rls.patient_a_id')::uuid,
    'connected', now() - interval '10 minutes', now() - interval '9 minutes');
  PERFORM set_config('test.call_integrity.id', call_id::text, true);
END;
$call_fixture$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub',current_setting('test.rls.patient_b_user'),'role','authenticated')::text,true);
DO $call_outsider$
DECLARE denied boolean := false; visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.calls WHERE id=current_setting('test.call_integrity.id')::uuid;
  IF visible_count <> 0 THEN RAISE EXCEPTION 'CALL INTEGRITY FAIL: unrelated user can read call'; END IF;
  BEGIN
    PERFORM public.update_call_status(current_setting('test.call_integrity.id')::uuid,'ended','outsider');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CALL INTEGRITY FAIL: unrelated user can change call'; END IF;
END;
$call_outsider$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub',current_setting('test.rls.doctor_a_user'),'role','authenticated')::text,true);
DO $call_participant$
DECLARE v_call_id uuid := current_setting('test.call_integrity.id')::uuid;
  first_end timestamptz; event_count integer; denied boolean;
BEGIN
  IF NOT public.update_call_status(v_call_id,'ended','participant_ended') THEN
    RAISE EXCEPTION 'CALL INTEGRITY FAIL: participant cannot end own call';
  END IF;
  SELECT ended_at INTO first_end FROM public.calls WHERE id=v_call_id;
  IF first_end IS NULL THEN RAISE EXCEPTION 'CALL INTEGRITY FAIL: closing timestamp missing'; END IF;
  IF public.update_call_status(v_call_id,'ended','replayed') THEN
    RAISE EXCEPTION 'CALL INTEGRITY FAIL: replay performed work';
  END IF;
  IF (SELECT ended_at FROM public.calls WHERE id=v_call_id) IS DISTINCT FROM first_end THEN
    RAISE EXCEPTION 'CALL INTEGRITY FAIL: replay changed closing time';
  END IF;
  SELECT count(*) INTO event_count FROM public.call_events WHERE call_events.call_id=v_call_id AND type='status_changed';
  IF event_count <> 1 THEN RAISE EXCEPTION 'CALL INTEGRITY FAIL: audit event count %',event_count; END IF;

  denied := false;
  BEGIN PERFORM public.update_call_status(v_call_id,'connected','reopen');
  EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'CALL INTEGRITY FAIL: terminal call reopened'; END IF;

  denied := false;
  BEGIN UPDATE public.calls SET ended_at=now()+interval '1 day' WHERE id=v_call_id;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'CALL INTEGRITY FAIL: direct call mutation allowed'; END IF;

  denied := false;
  BEGIN DELETE FROM public.call_events WHERE call_events.call_id=v_call_id;
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'CALL INTEGRITY FAIL: participant can delete audit'; END IF;

  denied := false;
  BEGIN INSERT INTO public.call_events(call_id,type,payload) VALUES(v_call_id,'status_changed','{}');
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'CALL INTEGRITY FAIL: participant can forge status audit'; END IF;

  INSERT INTO public.call_events(call_id,type,payload) VALUES(v_call_id,'debug_log','{"source":"synthetic_integrity_test"}');
END;
$call_participant$;
RESET ROLE;

DO $call_privileges$
BEGIN
  IF has_function_privilege('anon','public.update_call_status(uuid,public.call_status,text)','EXECUTE')
    OR has_table_privilege('authenticated','public.calls','INSERT')
    OR has_table_privilege('authenticated','public.calls','UPDATE')
    OR has_table_privilege('authenticated','public.calls','DELETE')
    OR has_table_privilege('authenticated','public.call_events','UPDATE')
    OR has_table_privilege('authenticated','public.call_events','DELETE') THEN
    RAISE EXCEPTION 'CALL INTEGRITY FAIL: excessive client privileges remain';
  END IF;
END;
$call_privileges$;
-- CALL_INTEGRITY_END

ROLLBACK;

