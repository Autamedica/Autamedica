-- Isolated regression test for Argentina electronic certificates.
-- This is NOT a real physician signature or a production issuance.
-- Requires a disposable local Supabase and `autamedica.isolated_test=on`.
-- Every fixture and related trigger effect is rolled back.
BEGIN;
DO $guard$
BEGIN
  IF current_setting('autamedica.isolated_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'AR certificate smoke may only run on isolated test databases';
  END IF;
END $guard$;

INSERT INTO auth.users
  (id, instance_id, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', now(), now(), '{}',
    '{"role":"doctor","first_name":"MEDICO","last_name":"SOLO DEMO"}'),
  ('00000000-0000-4000-8000-00000000a102', '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', now(), now(), '{}',
    '{"role":"patient","first_name":"PACIENTE","last_name":"SOLO DEMO"}');

-- The signup trigger creates profiles and role-specific records. Keep their
-- generated primary keys: other triggers may already reference those IDs.
UPDATE public.profiles
SET first_name = 'MEDICO', last_name = 'SOLO DEMO',
    sss_validation_status = 'valid', active = true, deleted_at = NULL
WHERE user_id = '00000000-0000-4000-8000-00000000a101';

UPDATE public.profiles
SET first_name = 'PACIENTE', last_name = 'SOLO DEMO', active = true, deleted_at = NULL
WHERE user_id = '00000000-0000-4000-8000-00000000a102';

UPDATE public.doctors d
SET license_number = 'DEMO-NO-HABILITANTE', license_type = 'MN',
    specialty = 'Medicina general', active = true,
    signature_image_url = 'https://invalid.example/storage/v1/object/sign/medical-documents/'
      || d.user_id::text || '/signatures/' || d.id::text || '/signature.png',
    stamp_image_url = 'https://invalid.example/storage/v1/object/sign/medical-documents/'
      || d.user_id::text || '/signatures/' || d.id::text || '/stamp.png'
WHERE d.user_id = '00000000-0000-4000-8000-00000000a101';

UPDATE public.patients
SET dni = '00000000', care_country = 'AR', active = true
WHERE user_id = '00000000-0000-4000-8000-00000000a102';

INSERT INTO public.patient_care_team (doctor_id, patient_id, active, role)
SELECT d.id, p.id, true, 'primary'
FROM public.doctors d CROSS JOIN public.patients p
WHERE d.user_id = '00000000-0000-4000-8000-00000000a101'
  AND p.user_id = '00000000-0000-4000-8000-00000000a102';

INSERT INTO public.medical_certificates
  (id, doctor_id, patient_id, certificate_type, days_of_rest,
    start_date, end_date, diagnosis, hide_diagnosis, cuir, qr_code_content,
    country_code, status)
SELECT
  '00000000-0000-4000-8000-00000000a401', d.id, p.id, 'reposo_laboral',
  2, current_date, current_date + 1, 'PRUEBA SINTETICA NO CLINICA',
  true, 'TEST-AR-NO-VALIDO', 'TEST-AR-NO-VALIDO', 'AR', 'draft'
FROM public.doctors d CROSS JOIN public.patients p
WHERE d.user_id = '00000000-0000-4000-8000-00000000a101'
  AND p.user_id = '00000000-0000-4000-8000-00000000a102';

DO $check$
DECLARE
  c public.medical_certificates%ROWTYPE;
  d public.doctors%ROWTYPE;
  pr public.profiles%ROWTYPE;
  pat public.patients%ROWTYPE;
  pp public.profiles%ROWTYPE;
  err text;
BEGIN
  SELECT * INTO c FROM public.medical_certificates
  WHERE id = '00000000-0000-4000-8000-00000000a401';

  IF NOT FOUND OR c.status <> 'draft' OR c.country_code <> 'AR' THEN
    RAISE EXCEPTION 'demo certificate must be an AR draft';
  END IF;

  -- No client or server may mark an unsigned draft as signed by simple update.
  BEGIN
    UPDATE public.medical_certificates SET status = 'signed' WHERE id = c.id;
    RAISE EXCEPTION 'unsigned draft was incorrectly accepted as signed';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    IF err = 'unsigned draft was incorrectly accepted as signed' THEN RAISE; END IF;
  END;

  SELECT * INTO c FROM public.medical_certificates WHERE id = c.id;
  IF c.status <> 'draft' THEN
    RAISE EXCEPTION 'failed direct signing mutated draft status';
  END IF;

  SELECT * INTO d FROM public.doctors WHERE id = c.doctor_id;
  SELECT * INTO pr FROM public.profiles WHERE user_id = d.user_id;
  SELECT * INTO pat FROM public.patients WHERE id = c.patient_id;
  SELECT * INTO pp FROM public.profiles WHERE user_id = pat.user_id;

  -- The server-side RPC must refuse finalization without an uploaded PDF.
  -- Synthetic URLs above never point to real professional signature assets.
  BEGIN
    PERFORM public.issue_electronic_medical_certificate(
      c.id, d.user_id, to_jsonb(c), to_jsonb(d), to_jsonb(pr),
      to_jsonb(pat), to_jsonb(pp), repeat('a',64), repeat('b',64),
      repeat('c',64), repeat('d',64), now()
    );
    RAISE EXCEPTION 'missing-PDF issuance was incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    IF err <> 'certificate_pdf_missing' THEN
      RAISE EXCEPTION 'unexpected issuance result: %', err;
    END IF;
  END;

  IF (SELECT status FROM public.medical_certificates WHERE id = c.id) <> 'draft'
     OR EXISTS (SELECT 1 FROM public.medical_certificate_electronic_issuances
                WHERE certificate_id = c.id) THEN
    RAISE EXCEPTION 'missing-PDF attempt changed issued records';
  END IF;

  IF has_function_privilege('anon',
      'public.issue_electronic_medical_certificate(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,text,text,timestamptz)',
      'EXECUTE')
     OR has_function_privilege('authenticated',
      'public.issue_electronic_medical_certificate(uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,text,text,timestamptz)',
      'EXECUTE') THEN
    RAISE EXCEPTION 'unprivileged role can execute issuance RPC';
  END IF;
  -- All signed rows, including retained historic records, must be immutable:
  -- their status must never be reverted to draft (the regression fixed by
  -- 20261104024500_ar_certificate_signed_status_immutable.sql).
  INSERT INTO public.medical_certificates
    (id, doctor_id, patient_id, certificate_type, days_of_rest,
     start_date, end_date, diagnosis, hide_diagnosis, cuir, qr_code_content,
     country_code, status, signed_pdf_url, signature_hash,
    signature_method, signature_verified_at)
  SELECT '00000000-0000-4000-8000-00000000a402', synthetic_doctor.id, synthetic_patient.id,
    'reposo_laboral', 1, current_date, current_date,
    'SIGNED SYNTHETIC NO REAL SIGNATURE', true, 'TEST-AR-SIGNED-SYNTHETIC',
    'TEST-AR-SIGNED-SYNTHETIC', 'AR', 'signed',
    'test-only/not-a-clinical-pdf.pdf', repeat('a',64), 'ac_external', now()
  FROM public.doctors synthetic_doctor CROSS JOIN public.patients synthetic_patient
  WHERE synthetic_doctor.user_id = '00000000-0000-4000-8000-00000000a101'
    AND synthetic_patient.user_id = '00000000-0000-4000-8000-00000000a102';

  IF NOT EXISTS (SELECT 1 FROM public.medical_certificates
      WHERE id = '00000000-0000-4000-8000-00000000a402' AND status = 'signed')
  THEN RAISE EXCEPTION 'synthetic signed legacy fixture not created'; END IF;

  BEGIN
    UPDATE public.medical_certificates
      SET status = 'draft'
      WHERE id = '00000000-0000-4000-8000-00000000a402';
    RAISE EXCEPTION 'signed certificate was downgraded to draft';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err = MESSAGE_TEXT;
    IF err <> 'issued_certificate_status_immutable' THEN
      RAISE EXCEPTION 'unexpected signed status update result: %', err;
    END IF;
  END;

  IF (SELECT status FROM public.medical_certificates
      WHERE id = '00000000-0000-4000-8000-00000000a402') <> 'signed'
  THEN RAISE EXCEPTION 'signed certificate status changed despite guard'; END IF;
END $check$;

ROLLBACK;

DO $no_leak$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users
       WHERE id IN ('00000000-0000-4000-8000-00000000a101',
                    '00000000-0000-4000-8000-00000000a102'))
     OR EXISTS (SELECT 1 FROM public.medical_certificates
       WHERE id = '00000000-0000-4000-8000-00000000a401') THEN
    RAISE EXCEPTION 'test fixtures leaked after rollback';
  END IF;
  RAISE NOTICE 'PASS: AR electronic certificate smoke; no records persisted';
END $no_leak$;
