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

  INSERT INTO public.doctors (id, user_id, license_number, specialty, active) VALUES
    (doctor_a_id, u_doctor_a, 'LIC-RLS-A', 'Cardiology', false),
    (doctor_b_id, u_doctor_b, 'LIC-RLS-B', 'Neurology', false);

  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, status) VALUES
    (appt_a_id, patient_a_id, doctor_a_id, now() + interval '1 day', 'scheduled'),
    (appt_b_id, patient_b_id, doctor_b_id, now() + interval '2 days', 'scheduled');

  INSERT INTO public.medical_records (id, patient_id, doctor_id, appointment_id, type, title, content) VALUES
    (record_a_id, patient_a_id, doctor_a_id, appt_a_id, 'consultation', 'RLS Record A', '{"notes":"test a"}'::jsonb),
    (record_b_id, patient_b_id, doctor_b_id, appt_b_id, 'consultation', 'RLS Record B', '{"notes":"test b"}'::jsonb);

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
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: doctor can read another doctor's medical record'; END IF;
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

ROLLBACK;
