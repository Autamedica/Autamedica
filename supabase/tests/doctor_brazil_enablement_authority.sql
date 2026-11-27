-- Brazil professional enablement authority and country isolation regression test.
-- Run only in disposable local database.
BEGIN;
DO $test$
DECLARE
  v_user_br uuid := gen_random_uuid();
  v_user_ar uuid := gen_random_uuid();
  v_user_admin uuid := gen_random_uuid();
  v_doctor_br uuid;
  v_doctor_ar uuid;
  v_message text := '';
BEGIN
  INSERT INTO auth.users(id, email)
  VALUES
    (v_user_br, 'br-enablement-' || v_user_br || '@example.invalid'),
    (v_user_ar, 'ar-enablement-' || v_user_ar || '@example.invalid'),
    (v_user_admin, 'admin-enablement-' || v_user_admin || '@example.invalid');

  UPDATE public.profiles
  SET active = true, role = 'doctor'
  WHERE user_id IN (v_user_br, v_user_ar);

  UPDATE public.profiles
  SET active = true, role = 'admin'
  WHERE user_id = v_user_admin;

  SELECT id INTO v_doctor_br FROM public.doctors WHERE user_id = v_user_br;
  IF v_doctor_br IS NULL THEN
    INSERT INTO public.doctors(id, user_id, active, license_type, license_number, uf_brazil, specialty)
    VALUES (gen_random_uuid(), v_user_br, true, 'CRM', '991234', 'RS', 'Psiquiatria')
    RETURNING id INTO v_doctor_br;
  ELSE
    UPDATE public.doctors
    SET active = true, license_type = 'CRM', license_number = '991234', uf_brazil = 'RS'
    WHERE id = v_doctor_br;
  END IF;

  SELECT id INTO v_doctor_ar FROM public.doctors WHERE user_id = v_user_ar;
  IF v_doctor_ar IS NULL THEN
    INSERT INTO public.doctors(id, user_id, active, license_type, license_number, specialty)
    VALUES (gen_random_uuid(), v_user_ar, true, 'MN', 'AR-991234', 'Clínica Médica')
    RETURNING id INTO v_doctor_ar;
  ELSE
    UPDATE public.doctors
    SET active = true, license_type = 'MN', license_number = 'AR-991234'
    WHERE id = v_doctor_ar;
  END IF;

  -- AR doctor cannot receive a Brazil credentials row even as postgres.
  BEGIN
    INSERT INTO public.doctor_brazil_credentials(doctor_id)
    VALUES (v_doctor_ar);
    RAISE EXCEPTION 'AR doctor was wrongly allowed into doctor_brazil_credentials';
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message <> 'BRAZIL_DOCTOR_COUNTRY_REQUIRED' THEN
        RAISE EXCEPTION 'Unexpected AR rejection message: %', v_message;
      END IF;
  END;

  -- Authenticate as BR doctor: self-progress is allowed, self-approval must fail.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_br::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.doctor_brazil_credentials(
    doctor_id, icp_brasil_status, icp_provider, sncr_b1_status, sncr_visa_uf, sncr_visa_municipality
  )
  VALUES (
    v_doctor_br, 'requested_cfm_free', 'cfm_cloud_a3', 'visa_requested', 'RS', 'Porto Alegre'
  );

  BEGIN
    UPDATE public.doctor_brazil_credentials
    SET icp_brasil_status = 'verified', can_issue_controlled_b1 = true
    WHERE doctor_id = v_doctor_br;
    RAISE EXCEPTION 'BR doctor self-approval was wrongly permitted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message <> 'CLINICAL_VALIDATION_ADMIN_ONLY' THEN
        RAISE EXCEPTION 'Wrong self-approval rejection: %', v_message;
      END IF;
  END;

  BEGIN
    UPDATE public.doctor_brazil_credentials
    SET can_issue_simple_rx = true
    WHERE doctor_id = v_doctor_br;
    RAISE EXCEPTION 'BR doctor capability self-grant was wrongly permitted';
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message <> 'CLINICAL_VALIDATION_ADMIN_ONLY' THEN
        RAISE EXCEPTION 'Wrong capability rejection: %', v_message;
      END IF;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- Admin/service_role can approve capabilities atomically.
  UPDATE public.doctor_brazil_credentials
  SET
    memed_link_status = 'test_emission_verified',
    memed_linked_at = now(),
    icp_brasil_status = 'verified',
    icp_verified_at = now(),
    icp_verified_by = v_user_admin,
    sncr_b1_status = 'verified',
    sncr_verified_at = now(),
    sncr_verified_by = v_user_admin,
    can_issue_simple_rx = true,
    can_issue_rce_ret_rx = true,
    can_issue_controlled_b1 = true,
    last_reviewed_by = v_user_admin,
    last_reviewed_at = now()
  WHERE doctor_id = v_doctor_br;

  IF NOT public.doctor_can_issue_br_rx(v_doctor_br, 'simple')
     OR NOT public.doctor_can_issue_br_rx(v_doctor_br, 'rce_ret')
     OR NOT public.doctor_can_issue_br_rx(v_doctor_br, 'controlled_b1') THEN
    RAISE EXCEPTION 'Verified BR doctor eligibility helper returned false';
  END IF;

  IF public.doctor_can_issue_br_rx(v_doctor_ar, 'simple') THEN
    RAISE EXCEPTION 'AR doctor wrongly reported eligible for BR rx';
  END IF;

  -- Confirm anon has zero table or helper privileges.
  IF has_table_privilege('anon', 'public.doctor_brazil_credentials', 'SELECT')
     OR has_table_privilege('anon', 'public.doctor_brazil_credentials', 'INSERT')
     OR has_table_privilege('anon', 'public.doctor_brazil_credentials', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.doctor_brazil_credentials', 'TRUNCATE')
     OR has_function_privilege('anon', 'public.doctor_can_issue_br_rx(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Unsafe anon/authenticated privilege on BR enablement objects';
  END IF;
END;
$test$;
ROLLBACK;
