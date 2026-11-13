-- This integration test runs ONLY in a disposable local Supabase database.
-- All synthetic clinician/appointment fixtures roll back.
-- Disabling USER triggers prevents external notifications, while GiST exclusion
-- constraints and ordinary foreign keys remain enforced.
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER USER;
ALTER TABLE public.doctors DISABLE TRIGGER USER;
ALTER TABLE public.appointments DISABLE TRIGGER USER;

DO $booking_test$
DECLARE
  v_user uuid := gen_random_uuid();
  v_doc uuid := gen_random_uuid();
  v_other_doc uuid := gen_random_uuid();
  v_first uuid := gen_random_uuid();
  v_adjacent uuid := gen_random_uuid();
  v_start timestamptz := now() + interval '7 days';
BEGIN
  INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at)
  VALUES(v_user,'00000000-0000-0000-0000-000000000000','authenticated',
         'authenticated','ci-booking-'||v_user||'@example.invalid',now(),now());
  INSERT INTO public.profiles(user_id) VALUES(v_user) ON CONFLICT(user_id) DO NOTHING;
  INSERT INTO public.doctors(id,user_id,license_number,specialty,active)
  VALUES(v_doc,v_user,'CI-BOOK-'||v_doc,'General',true),
        (v_other_doc,NULL,'CI-BOOK-'||v_other_doc,'General',true);

  INSERT INTO public.appointments(id,doctor_id,patient_id,start_time,end_time,type,status)
  VALUES(v_first,v_doc,NULL,v_start,v_start + interval '30 minutes','telemedicine','scheduled');

  BEGIN
    INSERT INTO public.appointments(id,doctor_id,patient_id,start_time,end_time,type,status)
    VALUES(gen_random_uuid(),v_doc,NULL,v_start + interval '15 minutes',
           v_start + interval '45 minutes','telemedicine','confirmed');
    RAISE EXCEPTION 'Overlapping appointment was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  INSERT INTO public.appointments(id,doctor_id,patient_id,start_time,end_time,type,status)
  VALUES(v_adjacent,v_doc,NULL,v_start + interval '30 minutes',
         v_start + interval '60 minutes','telemedicine','scheduled');

  BEGIN
    UPDATE public.appointments SET start_time=v_start + interval '15 minutes'
    WHERE id=v_adjacent;
    RAISE EXCEPTION 'Overlapping appointment update was accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;

  INSERT INTO public.appointments(id,doctor_id,patient_id,start_time,end_time,type,status)
  VALUES(gen_random_uuid(),v_other_doc,NULL,v_start,
         v_start + interval '30 minutes','telemedicine','scheduled');

  INSERT INTO public.appointments(id,doctor_id,patient_id,start_time,end_time,type,status)
  VALUES(gen_random_uuid(),v_doc,NULL,v_start,
         v_start + interval '30 minutes','telemedicine','cancelled');
  RAISE NOTICE 'Atomic doctor overlap INSERT/UPDATE exclusions and allowed controls passed';
END $booking_test$;

ALTER TABLE public.appointments ENABLE TRIGGER USER;
ALTER TABLE public.doctors ENABLE TRIGGER USER;
ALTER TABLE public.profiles ENABLE TRIGGER USER;
ROLLBACK;
