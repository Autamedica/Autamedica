-- Exercises row-level policies under the authenticated database role.
-- Run only against the disposable local Supabase database; all fixtures roll back.
BEGIN;

DO $setup$
DECLARE
  u_patient_a uuid := '10000000-0000-0000-0000-000000000001';
  u_patient_b uuid := '10000000-0000-0000-0000-000000000002';
  u_doctor_a uuid := '20000000-0000-0000-0000-000000000001';
  u_doctor_b uuid := '20000000-0000-0000-0000-000000000002';
  u_company uuid := '30000000-0000-0000-0000-000000000001';
  patient_a_id uuid := '40000000-0000-0000-0000-000000000001';
  patient_b_id uuid := '40000000-0000-0000-0000-000000000002';
  doctor_a_id uuid := '50000000-0000-0000-0000-000000000001';
  doctor_b_id uuid := '50000000-0000-0000-0000-000000000002';
  appt_a_id uuid := '60000000-0000-0000-0000-000000000001';
  appt_b_id uuid := '60000000-0000-0000-0000-000000000002';
  record_a_id uuid := '70000000-0000-0000-0000-000000000001';
  record_b_id uuid := '70000000-0000-0000-0000-000000000002';
  company_id uuid := '80000000-0000-0000-0000-000000000001';
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

  INSERT INTO public.profiles (user_id, email, role, external_id) VALUES
    (u_patient_a, 'rls_patient_a_' || fixture_suffix || '@test.com', 'patient', 'rls-pa-' || fixture_suffix),
    (u_patient_b, 'rls_patient_b_' || fixture_suffix || '@test.com', 'patient', 'rls-pb-' || fixture_suffix),
    (u_doctor_a, 'rls_doctor_a_' || fixture_suffix || '@test.com', 'doctor', 'rls-da-' || fixture_suffix),
    (u_doctor_b, 'rls_doctor_b_' || fixture_suffix || '@test.com', 'doctor', 'rls-db-' || fixture_suffix),
    (u_company, 'rls_company_' || fixture_suffix || '@test.com', 'company', 'rls-co-' || fixture_suffix);

  INSERT INTO public.patients (id, user_id) VALUES
    (patient_a_id, u_patient_a),
    (patient_b_id, u_patient_b);

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
END;
$setup$;

-- Patient A: own rows visible; another patient's clinical data hidden.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $patient_a$
DECLARE visible_count integer;
        affected_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.patients
    WHERE id='40000000-0000-0000-0000-000000000001';
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: patient cannot read own patient row'; END IF;

  SELECT count(*) INTO visible_count FROM public.patients
    WHERE id='40000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: patient can read another patient'; END IF;

  SELECT count(*) INTO visible_count FROM public.appointments
    WHERE id='60000000-0000-0000-0000-000000000001';
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: patient cannot read own appointment'; END IF;

  SELECT count(*) INTO visible_count FROM public.appointments
    WHERE id='60000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: patient can read another patient appointment'; END IF;

  SELECT count(*) INTO visible_count FROM public.medical_records
    WHERE id='70000000-0000-0000-0000-000000000001';
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: patient cannot read own medical record'; END IF;

  SELECT count(*) INTO visible_count FROM public.medical_records
    WHERE id='70000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: patient can read another patient medical record'; END IF;

  UPDATE public.doctors SET specialty = specialty
    WHERE id='50000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: patient updated doctor row'; END IF;
END;
$patient_a$;
RESET ROLE;

-- Doctor A: own rows and own appointment record visible; another doctor's data hidden.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $doctor_a$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.doctors
    WHERE id='50000000-0000-0000-0000-000000000001';
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: doctor cannot read own row'; END IF;

  SELECT count(*) INTO visible_count FROM public.doctors
    WHERE id='50000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: doctor can read another inactive doctor'; END IF;

  SELECT count(*) INTO visible_count FROM public.appointments
    WHERE id='60000000-0000-0000-0000-000000000001';
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: doctor cannot read assigned appointment'; END IF;

  SELECT count(*) INTO visible_count FROM public.appointments
    WHERE id='60000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: doctor can read another doctor appointment'; END IF;

  SELECT count(*) INTO visible_count FROM public.medical_records
    WHERE id='70000000-0000-0000-0000-000000000001';
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: doctor cannot read own medical record'; END IF;

  SELECT count(*) INTO visible_count FROM public.medical_records
    WHERE id='70000000-0000-0000-0000-000000000002';
  IF visible_count <> 0 THEN RAISE EXCEPTION 'RLS FAIL: doctor can read another doctor's medical record'; END IF;
END;
$doctor_a$;
RESET ROLE;

-- Company owner: only the owned inactive company row is visible.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $company_owner$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.companies
    WHERE id='80000000-0000-0000-0000-000000000001';
  IF visible_count <> 1 THEN RAISE EXCEPTION 'RLS FAIL: company owner cannot read owned company'; END IF;
END;
$company_owner$;
RESET ROLE;

ROLLBACK;
