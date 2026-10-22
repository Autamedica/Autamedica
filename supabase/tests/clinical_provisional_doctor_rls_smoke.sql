-- LOCAL DISPOSABLE SUPABASE DATABASE ONLY. Never execute against production.
-- Tests trusted active doctor authorization, historical active PENDING doctor
-- denial, and the policy guards for direct PostgREST read/write access.
-- All synthetic rows and trigger adjustments are rolled back.
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data)
VALUES (
  'a1000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'synthetic-rls-doctor@example.invalid',
  '{"role":"doctor","first_name":"Synthetic","last_name":"RLS"}'::jsonb,
  '{}'::jsonb
);

-- Simulate manual approval with a synthetic nonplaceholder credential.
UPDATE public.doctors
SET license_number='CRM-SYNTHETIC-TEST', active=true
WHERE user_id='a1000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);

DO $check$
BEGIN
 IF NOT public.is_doctor() THEN
   RAISE EXCEPTION 'Approved synthetic clinician denied unexpectedly';
 END IF;
END;
$check$;
RESET ROLE;

-- Legacy data exists with active=true and PENDING number; reproduce this
-- ONLY in the rolled-back local test, temporarily bypassing the new guard.
ALTER TABLE public.doctors DISABLE TRIGGER guard_provisional_doctor_activation;
UPDATE public.doctors
SET license_number='PENDING-LEGACY', active=true
WHERE user_id='a1000000-0000-4000-8000-000000000002';
ALTER TABLE public.doctors ENABLE TRIGGER guard_provisional_doctor_activation;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.doctors
    WHERE user_id = auth.uid()
      AND active=true
      AND license_number='PENDING-LEGACY'
  ) THEN
    RAISE EXCEPTION 'Legacy provisional-active test fixture not created';
  END IF;
  IF public.is_doctor() THEN
    RAISE EXCEPTION 'Historical active PENDING clinician is still authorized';
  END IF;
END;
$check$;

RESET ROLE;

DO $policies$
DECLARE bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM (VALUES
    ('medical_records','medical_records_select_scoped','qual'),
    ('medical_records','medical_records_soft_delete','qual'),
    ('medical_records','medical_records_soft_delete','with_check'),
    ('medical_orders','Doctors can update their own draft medical orders','with_check'),
    ('medical_certificates','Doctors can update their draft certificates','with_check'),
    ('medical_orders','Doctors can insert their own medical orders','with_check'),
    ('medical_orders','Doctors can view their own medical orders','qual'),
    ('medical_orders','Doctors can update their own draft medical orders','qual'),
    ('medical_certificates','Doctors can insert their own certificates','with_check'),
    ('medical_certificates','Doctors can view their own certificates','qual'),
    ('medical_certificates','Doctors can update their draft certificates','qual'),
    ('medical_chats','Users can view their own chats','qual'),
    ('medical_messages','Users can view messages from their chats','qual'),
    ('medical_messages','Users can insert messages in their chats','with_check')
  ) expected(tbl, policy, predicate)
  LEFT JOIN pg_policies pol
    ON pol.schemaname='public' AND pol.tablename=expected.tbl
    AND pol.policyname=expected.policy
  WHERE pol.policyname IS NULL OR
    (CASE WHEN expected.predicate='qual' THEN pol.qual ELSE pol.with_check END)
      NOT LIKE '%is_doctor()%';

  IF bad_count <> 0 THEN
    RAISE EXCEPTION 'Direct medical RLS missing approved clinician gate on % policies', bad_count;
  END IF;
END;
$policies$;

ROLLBACK;
