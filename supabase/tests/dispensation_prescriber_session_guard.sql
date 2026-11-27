-- Regression test for P0 fix in app_private.guard_dispensation_country().
-- Verifies that authenticated/anon JWT claims without a matching active doctor
-- session cannot bypass the SECURITY DEFINER trigger, while legitimate
-- service_role inserts succeed. Run only in disposable local database.
BEGIN;

DO $test$
DECLARE
  v_doc_uid uuid := gen_random_uuid();
  v_other_uid uuid := gen_random_uuid();
  v_patient_uid uuid := gen_random_uuid();
  v_doc_id uuid;
  v_patient_id uuid;
  v_rx_id uuid;
  v_message text := '';
  v_fn_def text;
BEGIN
  v_fn_def := pg_get_functiondef('app_private.guard_dispensation_country()'::regprocedure);
  IF v_fn_def ~* '\bcurrent_user\b' THEN
    RAISE EXCEPTION 'guard_dispensation_country still relies on current_user inside SECURITY DEFINER';
  END IF;
  IF position('request.jwt.claim.role' IN v_fn_def) = 0 THEN
    RAISE EXCEPTION 'guard_dispensation_country missing request.jwt.claim.role check';
  END IF;

  INSERT INTO auth.users(id, email)
  VALUES
    (v_doc_uid, 'disp-guard-doc-' || v_doc_uid || '@example.invalid'),
    (v_other_uid, 'disp-guard-other-' || v_other_uid || '@example.invalid'),
    (v_patient_uid, 'disp-guard-pat-' || v_patient_uid || '@example.invalid');

  UPDATE public.profiles SET active = true, role = 'doctor', sss_validation_status = 'valid'
  WHERE user_id IN (v_doc_uid, v_other_uid);

  UPDATE public.profiles SET active = true, role = 'patient'
  WHERE user_id = v_patient_uid;

  SELECT id INTO v_doc_id FROM public.doctors WHERE user_id = v_doc_uid;
  IF v_doc_id IS NULL THEN
    INSERT INTO public.doctors(id, user_id, active, license_type, license_number, specialty)
    VALUES (gen_random_uuid(), v_doc_uid, true, 'MN', 'CI-DISP-' || v_doc_uid::text, 'Psiquiatría')
    RETURNING id INTO v_doc_id;
  ELSE
    UPDATE public.doctors
    SET active = true, license_type = 'MN', license_number = 'CI-DISP-' || v_doc_uid::text
    WHERE id = v_doc_id;
  END IF;

  INSERT INTO public.doctor_licenses(doctor_id, license_type, license_number, province, status)
  VALUES (v_doc_id, 'MN', 'CI-DISP-' || v_doc_uid::text, 'CABA', 'active');

  INSERT INTO public.patients(user_id, active, care_country)
  VALUES (v_patient_uid, true, 'AR')
  ON CONFLICT (user_id) DO UPDATE SET active = true, care_country = 'AR'
  RETURNING id INTO v_patient_id;

  INSERT INTO public.prescriptions(patient_id, doctor_id, country_code, clinical_data, vendor_name, status)
  VALUES (v_patient_id, v_doc_id, 'AR', '{}'::jsonb, 'internal', 'signed')
  RETURNING id INTO v_rx_id;

  -- Simulate an authenticated JWT caller whose auth.uid() is NOT the prescriber.
  -- Before the fix, current_user='postgres' inside SECURITY DEFINER bypassed this check.
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', v_other_uid::text, true);

  BEGIN
    INSERT INTO public.dispensation_orders(
      prescription_id, patient_id, doctor_id, prescription_type, medication, formulation,
      quantity_units, duration_days, clinician_decision, prescriber_verified,
      reconciliation_status, dispense_window_start, dispense_window_end, status
    ) VALUES (
      v_rx_id, v_patient_id, v_doc_id, 'standard', 'Sertralina', '50mg',
      30, 30, 'under_review', false, 'pending', CURRENT_DATE, CURRENT_DATE + 30, 'pending'
    );
    RAISE EXCEPTION 'Authenticated non-prescriber bypassed guard_dispensation_country';
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message <> 'dispensation_order_prescriber_session_required' THEN
        RAISE EXCEPTION 'Unexpected trigger error: %', v_message;
      END IF;
  END;

  -- Legitimate service_role caller succeeds.
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  INSERT INTO public.dispensation_orders(
    prescription_id, patient_id, doctor_id, prescription_type, medication, formulation,
    quantity_units, duration_days, clinician_decision, prescriber_verified,
    reconciliation_status, dispense_window_start, dispense_window_end, status
  ) VALUES (
    v_rx_id, v_patient_id, v_doc_id, 'standard', 'Sertralina', '50mg',
    30, 30, 'under_review', false, 'pending', CURRENT_DATE, CURRENT_DATE + 30, 'pending'
  );
END;
$test$;

ROLLBACK;
