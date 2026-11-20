-- DO NOT RUN ON PRODUCTION. Synthetic Auth signup and authorization
-- test for a disposable local database only. This file creates/updates Auth users
-- inside a transaction and deliberately ROLLS BACK all mutations.
BEGIN;
INSERT INTO auth.users (id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
VALUES
  ('a1000000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated',
   'synthetic-doctor@example.invalid',
   '{"role":"doctor","first_name":"Synthetic","last_name":"Doctor"}'::jsonb,
   '{}'::jsonb);

DO $test$
DECLARE d record; profile_role text;
BEGIN
  SELECT role INTO profile_role FROM public.profiles
   WHERE user_id='a1000000-0000-4000-8000-000000000001';
  IF profile_role <> 'doctor' THEN
    RAISE EXCEPTION 'Signup doctor profile missing, actual role %',profile_role;
  END IF;
  SELECT id,active,license_number INTO d FROM public.doctors
   WHERE user_id='a1000000-0000-4000-8000-000000000001';
  IF d.id IS NULL OR d.active IS DISTINCT FROM FALSE OR d.license_number NOT LIKE 'PENDING%' THEN
    RAISE EXCEPTION 'Provisional doctor was not quarantined';
  END IF;
END;
$test$;

-- Even a privileged operation cannot activate a provisional license.
UPDATE public.doctors SET active=true
 WHERE user_id='a1000000-0000-4000-8000-000000000001';
DO $test$ BEGIN
  IF EXISTS(SELECT 1 FROM public.doctors WHERE
    user_id='a1000000-0000-4000-8000-000000000001' AND active=true)
  THEN RAISE EXCEPTION 'Doctor activated with PENDING credential'; END IF;
END; $test$;

-- Simulate a *trusted* admin decision after external license verification.
-- This is test data, not a claim that the synthetic credential is real.
UPDATE public.doctors
  SET license_number='SYNTHETIC-VERIFIED-TEST',active=true
 WHERE user_id='a1000000-0000-4000-8000-000000000001';
DO $test$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.doctors WHERE
    user_id='a1000000-0000-4000-8000-000000000001'
    AND active=true AND license_number='SYNTHETIC-VERIFIED-TEST')
  THEN RAISE EXCEPTION 'Trusted admin approval path failed'; END IF;
END; $test$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
DO $test$
DECLARE denial text;
BEGIN
  BEGIN
    UPDATE public.doctors SET active=false
      WHERE user_id='a1000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Client changed doctor activation flag';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS denial=MESSAGE_TEXT;
    IF denial <> 'Doctor activation and license verification require trusted provisioning' THEN
      RAISE EXCEPTION 'Unexpected refusal: %',denial;
    END IF;
  END;
  BEGIN
    UPDATE public.doctors SET license_number='FAKE-LICENSE'
      WHERE user_id='a1000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Client changed authoritative license';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS denial=MESSAGE_TEXT;
    IF denial <> 'Doctor activation and license verification require trusted provisioning' THEN
      RAISE EXCEPTION 'Unexpected license refusal: %',denial;
    END IF;
  END;
END;
$test$;
RESET ROLE;
ROLLBACK;
