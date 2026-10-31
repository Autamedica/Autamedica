-- Disposable local DB ONLY. Fixtures roll back, no real clinicians/patients.
-- Test actors: patient, assigned doctor, unauthenticated and trusted DB code.
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER USER;
ALTER TABLE public.doctors DISABLE TRIGGER USER;
ALTER TABLE public.patients DISABLE TRIGGER USER;
ALTER TABLE public.appointments DISABLE TRIGGER USER;
ALTER TABLE public.appointments ENABLE TRIGGER trg_appointment_actor_guard;
ALTER TABLE public.appointments ENABLE TRIGGER trg_appointment_metadata_immutable;

DO $setup$
DECLARE
  v_patient_user uuid := gen_random_uuid();
  v_doctor_user uuid := gen_random_uuid();
  v_patient uuid := gen_random_uuid();
  v_doctor uuid := gen_random_uuid();
  v_patient_appt uuid := gen_random_uuid();
  v_doctor_appt uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at)
  VALUES(v_patient_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'ci-patient-'||v_patient_user||'@example.invalid',now(),now()),
        (v_doctor_user,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    'ci-doctor-'||v_doctor_user||'@example.invalid',now(),now());
  INSERT INTO public.profiles(user_id) VALUES(v_patient_user),(v_doctor_user)
    ON CONFLICT(user_id) DO NOTHING;
  -- The auth.users signup trigger may have already provisioned a patient.
  -- Reuse that row instead of violating unique(patient.user_id).
  SELECT id INTO v_patient FROM public.patients WHERE user_id=v_patient_user LIMIT 1;
  IF v_patient IS NULL THEN
    v_patient := gen_random_uuid();
    INSERT INTO public.patients(id,user_id,active) VALUES(v_patient,v_patient_user,true);
  END IF;
  INSERT INTO public.doctors(id,user_id,license_number,specialty,active)
  VALUES(v_doctor,v_doctor_user,'CI-ACTOR-'||v_doctor,'General',true);
  INSERT INTO public.appointments(id,patient_id,doctor_id,start_time,end_time,type,status)
  VALUES(v_patient_appt,v_patient,v_doctor,now()+interval '8 days',now()+interval '8 days 30 minutes','telemedicine','scheduled'),
        (v_doctor_appt,v_patient,v_doctor,now()+interval '9 days',now()+interval '9 days 30 minutes','telemedicine','scheduled');
  PERFORM set_config('test.actor_patient_uid',v_patient_user::text,true);
  PERFORM set_config('test.actor_doctor_uid',v_doctor_user::text,true);
  PERFORM set_config('test.actor_patient_appointment',v_patient_appt::text,true);
  PERFORM set_config('test.actor_doctor_appointment',v_doctor_appt::text,true);
END $setup$;

SET LOCAL ROLE authenticated;
DO $checks$
DECLARE
  v_patient_uid uuid := current_setting('test.actor_patient_uid')::uuid;
  v_doctor_uid uuid := current_setting('test.actor_doctor_uid')::uuid;
  v_patient_appt uuid := current_setting('test.actor_patient_appointment')::uuid;
  v_doctor_appt uuid := current_setting('test.actor_doctor_appointment')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
  BEGIN
    UPDATE public.appointments SET notes='unauthorized anonymous actor'
    WHERE id=v_patient_appt;
    IF FOUND THEN RAISE EXCEPTION 'Missing subject was allowed to update appointment'; END IF;
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_patient_uid)::text,true);

  BEGIN
    UPDATE public.appointments SET status='completed' WHERE id=v_patient_appt;
    RAISE EXCEPTION 'Patient was allowed to mark appointment completed';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    UPDATE public.appointments SET doctor_id=NULL WHERE id=v_patient_appt;
    RAISE EXCEPTION 'Patient was allowed to detach assigned physician';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    UPDATE public.appointments SET patient_id=NULL WHERE id=v_patient_appt;
    RAISE EXCEPTION 'Patient was allowed to detach patient identity';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  -- Existing appointment provenance cannot be forged via direct Data API UPDATE.
  BEGIN
    UPDATE public.appointments SET created_by=v_doctor_uid WHERE id=v_patient_appt;
    RAISE EXCEPTION 'Patient forged doctor-created payment exemption';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    UPDATE public.appointments SET deleted_at=now() WHERE id=v_patient_appt;
    RAISE EXCEPTION 'Patient erased appointment audit trail';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  BEGIN
    UPDATE public.appointments SET referral_sent=true WHERE id=v_patient_appt;
    RAISE EXCEPTION 'Patient forged referral delivery';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  -- New appointment provenance must also be protected at INSERT time.
  BEGIN
    INSERT INTO public.appointments
      (patient_id,doctor_id,start_time,end_time,type,status,created_by)
    SELECT a.patient_id,a.doctor_id,
           now()+interval '10 days',now()+interval '10 days 30 minutes',
           'telemedicine','scheduled',v_doctor_uid
    FROM public.appointments a WHERE a.id=v_patient_appt;
    RAISE EXCEPTION 'Patient inserted appointment impersonating doctor';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;

  UPDATE public.appointments SET notes='ci harmless patient note'
  WHERE id=v_patient_appt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legitimate patient note edit blocked'; END IF;
  UPDATE public.appointments SET status='cancelled' WHERE id=v_patient_appt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legitimate patient cancellation blocked'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('role','authenticated','sub',v_doctor_uid)::text,true);

  BEGIN
    UPDATE public.appointments SET status='completed' WHERE id=v_doctor_appt;
    RAISE EXCEPTION 'Doctor skipped required appointment workflow';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
  UPDATE public.appointments SET status='in_progress' WHERE id=v_doctor_appt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legitimate doctor start blocked'; END IF;
  UPDATE public.appointments SET status='completed' WHERE id=v_doctor_appt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legitimate doctor completion blocked'; END IF;
  BEGIN
    UPDATE public.appointments SET patient_id=NULL WHERE id=v_doctor_appt;
    RAISE EXCEPTION 'Doctor was allowed to detach patient identity';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $checks$;

RESET ROLE;
ALTER TABLE public.appointments DISABLE TRIGGER trg_appointment_actor_guard;
ALTER TABLE public.appointments DISABLE TRIGGER trg_appointment_metadata_immutable;
ALTER TABLE public.appointments ENABLE TRIGGER USER;
ALTER TABLE public.patients ENABLE TRIGGER USER;
ALTER TABLE public.doctors ENABLE TRIGGER USER;
ALTER TABLE public.profiles ENABLE TRIGGER USER;
ROLLBACK;
