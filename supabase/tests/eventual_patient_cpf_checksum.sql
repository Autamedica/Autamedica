-- Disposable database only: verify create_doctor_eventual_patient uses Receita Federal
-- 1-indexed modulo-11 weights (10..2 and 11..2) for Brazilian CPFs.
BEGIN;
DO $guard$
BEGIN
  IF current_setting('autamedica.isolated_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'isolated_test must be on';
  END IF;
END $guard$;

DO $test$
DECLARE
  fn_def text;
  doc_user_id uuid := gen_random_uuid();
  doc_id uuid;
  res jsonb;
  invalid_rejected boolean := false;
BEGIN
  fn_def := pg_get_functiondef(
    'public.create_doctor_eventual_patient(uuid,text,text,text,text,date,text,text,text,text)'::regprocedure
  );
  IF strpos(fn_def, 'v_len + 2 - v_idx') = 0 OR strpos(fn_def, 'v_len + 1 - v_idx') > 0 THEN
    RAISE EXCEPTION 'create_doctor_eventual_patient CPF checksum weights regression detected';
  END IF;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    doc_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'cpf-test-doctor@synthetic.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"doctor"}'::jsonb, now(), now()
  );

  INSERT INTO public.profiles (user_id, email, role, first_name, last_name, active)
  VALUES (doc_user_id, 'cpf-test-doctor@synthetic.invalid', 'doctor', 'Synthetic', 'Doctor', true)
  ON CONFLICT (user_id) DO UPDATE SET role = 'doctor', active = true;

  INSERT INTO public.doctors (user_id, specialty, license_type, license_number, uf_brazil, active)
  VALUES (doc_user_id, 'Clínica Geral', 'CRM', '999999', 'RS', true)
  ON CONFLICT (user_id) DO UPDATE
    SET specialty = EXCLUDED.specialty,
        license_type = EXCLUDED.license_type,
        license_number = EXCLUDED.license_number,
        uf_brazil = EXCLUDED.uf_brazil,
        active = true
  RETURNING id INTO doc_id;

  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- Synthetic valid CPF checksum (52998224725) must be accepted.
  res := public.create_doctor_eventual_patient(
    doc_id, 'BR', 'Paciente Teste', 'CPF', '52998224725',
    DATE '1990-01-01', 'female', NULL, 'cpf-test-patient@synthetic.invalid',
    'prescription_issuance_and_delivery'
  );
  IF res->>'patient_id' IS NULL THEN
    RAISE EXCEPTION 'Expected patient_id for valid synthetic CPF';
  END IF;

  -- Synthetic invalid CPF checksum (52998224726) must be rejected.
  BEGIN
    PERFORM public.create_doctor_eventual_patient(
      doc_id, 'BR', 'Paciente Invalido', 'CPF', '52998224726',
      DATE '1990-01-01', 'female', NULL, 'cpf-invalid-patient@synthetic.invalid',
      'prescription_issuance_and_delivery'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM = 'eventual_patient_cpf_invalid' THEN
      invalid_rejected := true;
    END IF;
  END;

  IF NOT invalid_rejected THEN
    RAISE EXCEPTION 'Expected eventual_patient_cpf_invalid for invalid CPF 52998224726';
  END IF;
END $test$;
ROLLBACK;
