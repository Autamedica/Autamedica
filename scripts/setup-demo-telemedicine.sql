-- Demo doctor-patient telemedicine setup for Android.
--
-- Use this in Supabase SQL Editor with admin/service-role privileges.
-- It assumes BOTH auth users already exist in auth.users.
--
-- Why this script writes both legacy and LiveKit data:
-- - The current Android build defaults USE_LIVEKIT=false.
-- - Join availability can come from telemedicine_sessions OR calls.
-- - The installed Android runtime still resolves the actual room through
--   appointments.meeting_url -> calls for the legacy WebRTC path.
--
-- Before running:
-- 1. Replace the emails below with real existing auth accounts.
-- 2. Adjust names/license/specialty if needed.
-- 3. Run the whole file as a single transaction.

BEGIN;

DO $setup$
DECLARE
  v_doctor_email text := 'doctor.demo@autamedica.com';
  v_patient_email text := 'patient.demo@autamedica.com';

  v_doctor_first_name text := 'Doctor';
  v_doctor_last_name text := 'Demo';
  v_patient_first_name text := 'Paciente';
  v_patient_last_name text := 'Demo';

  v_doctor_license text := 'MP-DEMO-0001';
  v_doctor_specialty text := 'Medicina General';

  v_appointment_id uuid := '6f7b5800-8b87-4f97-a63f-9775fd8f1001';
  v_call_id uuid := '6f7b5800-8b87-4f97-a63f-9775fd8f2001';
  v_session_id uuid := '6f7b5800-8b87-4f97-a63f-9775fd8f3001';
  v_room_id text := 'autamedica_demo_room_20260306';

  v_start_time timestamptz := now() + interval '10 minutes';
  v_duration_minutes integer := 30;

  v_doctor_auth_id uuid;
  v_patient_auth_id uuid;
  v_doctor_record_id uuid;
  v_patient_record_id uuid;
  v_doctor_resolved_email text;
  v_patient_resolved_email text;
BEGIN
  SELECT id, email
  INTO v_doctor_auth_id, v_doctor_resolved_email
  FROM auth.users
  WHERE lower(email) = lower(v_doctor_email)
  LIMIT 1;

  SELECT id, email
  INTO v_patient_auth_id, v_patient_resolved_email
  FROM auth.users
  WHERE lower(email) = lower(v_patient_email)
  LIMIT 1;

  IF v_doctor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Doctor auth user not found for email %', v_doctor_email;
  END IF;

  IF v_patient_auth_id IS NULL THEN
    RAISE EXCEPTION 'Patient auth user not found for email %', v_patient_email;
  END IF;

  IF v_doctor_auth_id = v_patient_auth_id THEN
    RAISE EXCEPTION 'Doctor and patient cannot be the same auth user';
  END IF;

  -- Keep auth metadata aligned with Android login resolution.
  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) ||
    jsonb_build_object(
      'role', 'doctor',
      'first_name', COALESCE(NULLIF(raw_user_meta_data ->> 'first_name', ''), v_doctor_first_name),
      'last_name', COALESCE(NULLIF(raw_user_meta_data ->> 'last_name', ''), v_doctor_last_name)
    )
  WHERE id = v_doctor_auth_id;

  UPDATE auth.users
  SET raw_user_meta_data =
    COALESCE(raw_user_meta_data, '{}'::jsonb) ||
    jsonb_build_object(
      'role', 'patient',
      'first_name', COALESCE(NULLIF(raw_user_meta_data ->> 'first_name', ''), v_patient_first_name),
      'last_name', COALESCE(NULLIF(raw_user_meta_data ->> 'last_name', ''), v_patient_last_name)
    )
  WHERE id = v_patient_auth_id;

  INSERT INTO public.profiles (
    user_id,
    email,
    role,
    first_name,
    last_name,
    active
  )
  VALUES (
    v_doctor_auth_id,
    COALESCE(v_doctor_resolved_email, v_doctor_email),
    'doctor',
    v_doctor_first_name,
    v_doctor_last_name,
    true
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    role = 'doctor',
    first_name = COALESCE(NULLIF(public.profiles.first_name, ''), EXCLUDED.first_name),
    last_name = COALESCE(NULLIF(public.profiles.last_name, ''), EXCLUDED.last_name),
    active = true,
    updated_at = now();

  INSERT INTO public.profiles (
    user_id,
    email,
    role,
    first_name,
    last_name,
    active
  )
  VALUES (
    v_patient_auth_id,
    COALESCE(v_patient_resolved_email, v_patient_email),
    'patient',
    v_patient_first_name,
    v_patient_last_name,
    true
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    role = 'patient',
    first_name = COALESCE(NULLIF(public.profiles.first_name, ''), EXCLUDED.first_name),
    last_name = COALESCE(NULLIF(public.profiles.last_name, ''), EXCLUDED.last_name),
    active = true,
    updated_at = now();

  INSERT INTO public.doctors (
    user_id,
    license_number,
    specialty,
    active
  )
  VALUES (
    v_doctor_auth_id,
    v_doctor_license,
    v_doctor_specialty,
    true
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    license_number = COALESCE(NULLIF(public.doctors.license_number, ''), EXCLUDED.license_number),
    specialty = COALESCE(NULLIF(public.doctors.specialty, ''), EXCLUDED.specialty),
    active = true,
    updated_at = now();

  INSERT INTO public.patients (
    user_id,
    active
  )
  VALUES (
    v_patient_auth_id,
    true
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    active = true,
    updated_at = now();

  SELECT id
  INTO v_doctor_record_id
  FROM public.doctors
  WHERE user_id = v_doctor_auth_id;

  SELECT id
  INTO v_patient_record_id
  FROM public.patients
  WHERE user_id = v_patient_auth_id;

  IF v_doctor_record_id IS NULL THEN
    RAISE EXCEPTION 'Doctor record was not created for auth user %', v_doctor_auth_id;
  END IF;

  IF v_patient_record_id IS NULL THEN
    RAISE EXCEPTION 'Patient record was not created for auth user %', v_patient_auth_id;
  END IF;

  INSERT INTO public.doctor_patient (
    doctor_id,
    patient_id
  )
  VALUES (
    v_doctor_record_id,
    v_patient_record_id
  )
  ON CONFLICT (doctor_id, patient_id) DO NOTHING;

  INSERT INTO public.patient_care_team (
    patient_id,
    doctor_id,
    role,
    active
  )
  VALUES (
    v_patient_record_id,
    v_doctor_record_id,
    'primary',
    true
  )
  ON CONFLICT (patient_id, doctor_id) DO UPDATE
  SET
    role = EXCLUDED.role,
    active = true,
    updated_at = now();

  INSERT INTO public.calls (
    id,
    room_id,
    doctor_id,
    patient_id,
    status,
    created_at,
    accepted_at,
    reason
  )
  VALUES (
    v_call_id,
    v_room_id,
    v_doctor_auth_id,
    v_patient_auth_id,
    'accepted',
    now(),
    now(),
    NULL
  )
  ON CONFLICT (id) DO UPDATE
  SET
    room_id = EXCLUDED.room_id,
    doctor_id = EXCLUDED.doctor_id,
    patient_id = EXCLUDED.patient_id,
    status = EXCLUDED.status,
    accepted_at = COALESCE(public.calls.accepted_at, EXCLUDED.accepted_at),
    ended_at = NULL,
    reason = NULL;

  INSERT INTO public.appointments (
    id,
    patient_id,
    doctor_id,
    start_time,
    end_time,
    duration_minutes,
    type,
    status,
    notes,
    meeting_url,
    created_by
  )
  VALUES (
    v_appointment_id,
    v_patient_record_id,
    v_doctor_record_id,
    v_start_time,
    v_start_time + make_interval(mins => v_duration_minutes),
    v_duration_minutes,
    'telemedicine',
    'confirmed',
    'Demo Android telemedicine appointment',
    v_call_id::text,
    v_doctor_auth_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    patient_id = EXCLUDED.patient_id,
    doctor_id = EXCLUDED.doctor_id,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    duration_minutes = EXCLUDED.duration_minutes,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    meeting_url = EXCLUDED.meeting_url,
    updated_at = now();

  INSERT INTO public.telemedicine_sessions (
    id,
    patient_id,
    doctor_id,
    status,
    scheduled_at,
    room_id,
    appointment_id,
    doctor_profile_id,
    patient_profile_id
  )
  VALUES (
    v_session_id,
    v_patient_auth_id,
    v_doctor_auth_id,
    'waiting',
    v_start_time,
    v_room_id,
    v_appointment_id,
    v_doctor_record_id,
    v_patient_record_id
  )
  ON CONFLICT (id) DO UPDATE
  SET
    patient_id = EXCLUDED.patient_id,
    doctor_id = EXCLUDED.doctor_id,
    status = EXCLUDED.status,
    scheduled_at = EXCLUDED.scheduled_at,
    room_id = EXCLUDED.room_id,
    appointment_id = EXCLUDED.appointment_id,
    doctor_profile_id = EXCLUDED.doctor_profile_id,
    patient_profile_id = EXCLUDED.patient_profile_id,
    updated_at = now();

  RAISE NOTICE 'Demo telemedicine ready';
  RAISE NOTICE 'doctor_auth_id=%', v_doctor_auth_id;
  RAISE NOTICE 'patient_auth_id=%', v_patient_auth_id;
  RAISE NOTICE 'doctor_profile_id=%', v_doctor_record_id;
  RAISE NOTICE 'patient_profile_id=%', v_patient_record_id;
  RAISE NOTICE 'appointment_id=%', v_appointment_id;
  RAISE NOTICE 'call_id=%', v_call_id;
  RAISE NOTICE 'telemedicine_session_id=%', v_session_id;
  RAISE NOTICE 'room_id=%', v_room_id;
END
$setup$;

COMMIT;

-- Verification queries (run separately if needed)
--
-- SELECT u.id, u.email, u.raw_user_meta_data ->> 'role' AS auth_role
-- FROM auth.users u
-- WHERE lower(u.email) IN (
--   lower('doctor.demo@autamedica.com'),
--   lower('patient.demo@autamedica.com')
-- );
--
-- SELECT p.user_id, p.email, p.role, p.first_name, p.last_name
-- FROM public.profiles p
-- WHERE lower(p.email) IN (
--   lower('doctor.demo@autamedica.com'),
--   lower('patient.demo@autamedica.com')
-- );
--
-- SELECT d.id AS doctor_profile_id, d.user_id, d.license_number, d.specialty, d.active
-- FROM public.doctors d
-- JOIN public.profiles p ON p.user_id = d.user_id
-- WHERE lower(p.email) = lower('doctor.demo@autamedica.com');
--
-- SELECT pt.id AS patient_profile_id, pt.user_id, pt.active
-- FROM public.patients pt
-- JOIN public.profiles p ON p.user_id = pt.user_id
-- WHERE lower(p.email) = lower('patient.demo@autamedica.com');
--
-- SELECT a.id, a.status, a.type, a.start_time, a.meeting_url, a.doctor_id, a.patient_id
-- FROM public.appointments a
-- WHERE a.id = '6f7b5800-8b87-4f97-a63f-9775fd8f1001';
--
-- SELECT c.id, c.room_id, c.status, c.doctor_id, c.patient_id
-- FROM public.calls c
-- WHERE c.id = '6f7b5800-8b87-4f97-a63f-9775fd8f2001';
--
-- SELECT ts.id, ts.status, ts.room_id, ts.appointment_id, ts.doctor_id, ts.patient_id
-- FROM public.telemedicine_sessions ts
-- WHERE ts.id = '6f7b5800-8b87-4f97-a63f-9775fd8f3001';
