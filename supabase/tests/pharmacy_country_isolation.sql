-- P0 pharmacy AR/BR contract checks.
-- Run only on a disposable database after the country-isolation migration.
BEGIN;
DO $$ BEGIN
  IF current_setting('autamedica.isolated_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'pharmacy_country_isolation: isolated_test must be on';
  END IF;
END $$;

DO $checks$
DECLARE
  v_table text;
  v_trigger text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pharmacies','pharmacists','dispensation_orders'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_table
        AND column_name='care_country' AND is_nullable='NO'
    ) THEN RAISE EXCEPTION 'Missing mandatory care_country on %',v_table; END IF;
  END LOOP;

  FOREACH v_trigger IN ARRAY ARRAY[
    'zz_pharmacy_country','zz_pharmacist_country','zz_dispensation_country',
    'zz_dispensation_validations_country','zz_dispensation_events_country',
    'zz_dispensation_clarifications_country','zz_prescription_dispensation_country_lock'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname=v_trigger AND tgenabled='O'
    ) THEN RAISE EXCEPTION 'Country guard missing or disabled: %',v_trigger; END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dispensation_orders'
      AND column_name='prescriber_verified' AND column_default ~* 'false'
  ) THEN RAISE EXCEPTION 'Prescriber verification defaults to trusted'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.dispensation_orders o
    JOIN public.prescriptions rx ON rx.id=o.prescription_id
    JOIN public.doctors d ON d.id=o.doctor_id
    JOIN public.patients pa ON pa.id=o.patient_id
    LEFT JOIN public.pharmacies ph ON ph.id=o.pharmacy_id
    WHERE o.care_country IS DISTINCT FROM rx.country_code
       OR o.care_country IS DISTINCT FROM d.care_country
       OR o.care_country IS DISTINCT FROM pa.care_country
       OR (o.pharmacy_id IS NOT NULL AND o.care_country IS DISTINCT FROM ph.care_country)
       OR o.patient_id IS DISTINCT FROM rx.patient_id
       OR o.doctor_id IS DISTINCT FROM rx.doctor_id
  ) THEN RAISE EXCEPTION 'Cross-country dispensation order detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.pharmacists ph JOIN public.pharmacies f ON f.id=ph.pharmacy_id
    WHERE ph.care_country IS DISTINCT FROM f.care_country
  ) THEN RAISE EXCEPTION 'Cross-country pharmacist registration detected'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='dispensation_orders'
      AND policyname='dispensation_orders_select_pharmacist'
      AND qual LIKE '%care_country%'
  ) THEN RAISE EXCEPTION 'Unassigned queue is not country scoped'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='dispensation_orders'
      AND policyname='dispensation_orders_update_pharmacist'
      AND with_check LIKE '%care_country%'
  ) THEN RAISE EXCEPTION 'Pharmacist order claims not country scoped'; END IF;
END $checks$;

-- Behavioral test: a non-AR/BR pharmacy cannot be inserted, despite a valid license string.
DO $negative_country$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.pharmacies(name,license_number,care_country)
      VALUES ('CI invalid jurisdiction', 'CI-PHARM-INVALID-'||gen_random_uuid(), 'CL');
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Pharmacy accepted a country outside AR/BR';
  END IF;
END $negative_country$;

-- Successful AR/BR pharmacy registration and negative country reassignment.
DO $immutable$
DECLARE v_id uuid; v_rejected boolean := false;
BEGIN
  INSERT INTO public.pharmacies(name,license_number,care_country)
    VALUES ('CI pharmacy AR', 'CI-PHARM-AR-'||gen_random_uuid(), 'AR')
    RETURNING id INTO v_id;
  IF (SELECT care_country FROM public.pharmacies WHERE id=v_id) <> 'AR' THEN
    RAISE EXCEPTION 'Pharmacy country was not stored';
  END IF;
  BEGIN
    UPDATE public.pharmacies SET care_country='BR' WHERE id=v_id;
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Pharmacy country changed after registration'; END IF;
END $immutable$;

-- Invalid prescribing identity fails before a foreign key could make an order.
DO $invalid_prescription$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.dispensation_orders(
      prescription_id,doctor_id,patient_id,medication,formulation,
      quantity_units,duration_days,dispense_window_start,dispense_window_end
    ) VALUES (
      gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
      'Synthetic medicine','tablet',1,30,current_date,current_date+30
    );
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Dispensation order accepted without a country-validated Rx';
  END IF;
END $invalid_prescription$;


-- Full transaction-only jurisdiction regression: two physician/patient markets,
-- two pharmacies, licensed pharmacists, and an assigned dispensation order.
DO $behavior$
DECLARE
  v_ar_doctor_user uuid := gen_random_uuid();
  v_ar_patient_user uuid := gen_random_uuid();
  v_ar_pharmacist_user uuid := gen_random_uuid();
  v_br_pharmacist_user uuid := gen_random_uuid();
  v_ar_doctor uuid := gen_random_uuid();
  v_ar_patient uuid;
  v_ar_pharmacy uuid;
  v_br_pharmacy uuid;
  v_ar_pharmacist uuid;
  v_br_pharmacist uuid;
  v_rx uuid;
  v_order uuid;
  v_rejected boolean;
  v_actual_country text;
BEGIN
  INSERT INTO auth.users(id,email) VALUES
    (v_ar_doctor_user, 'ci-pharmacy-dr-'||v_ar_doctor_user||'@example.invalid'),
    (v_ar_patient_user, 'ci-pharmacy-pt-'||v_ar_patient_user||'@example.invalid'),
    (v_ar_pharmacist_user, 'ci-pharmacy-ar-'||v_ar_pharmacist_user||'@example.invalid'),
    (v_br_pharmacist_user, 'ci-pharmacy-br-'||v_br_pharmacist_user||'@example.invalid');
  UPDATE public.profiles SET role='doctor',active=true WHERE user_id=v_ar_doctor_user;
  UPDATE public.profiles SET role='patient',active=true WHERE user_id=v_ar_patient_user;

  INSERT INTO public.patients(user_id,active) VALUES (v_ar_patient_user,true)
    ON CONFLICT(user_id) DO NOTHING;
  UPDATE public.patients SET care_country='AR' WHERE user_id=v_ar_patient_user;
  SELECT id INTO STRICT v_ar_patient FROM public.patients WHERE user_id=v_ar_patient_user;

  -- Signup triggers can precreate a doctor row; reuse that row, as clinical_country_isolation.sql does.
  INSERT INTO public.doctors(id,user_id,license_type,license_number,specialty,active)
  VALUES(v_ar_doctor,v_ar_doctor_user,'MN','CI-'||v_ar_doctor::text,'Test doctor AR',true)
  ON CONFLICT(user_id) DO UPDATE SET
    license_type=excluded.license_type,license_number=excluded.license_number,
    specialty=excluded.specialty,active=true;
  SELECT id INTO STRICT v_ar_doctor FROM public.doctors WHERE user_id=v_ar_doctor_user;
  IF (SELECT care_country FROM public.doctors WHERE id=v_ar_doctor) IS DISTINCT FROM 'AR' THEN
    RAISE EXCEPTION 'AR doctor credential not classified AR';
  END IF;

  INSERT INTO public.pharmacies(name,license_number,care_country)
    VALUES ('CI AR farmacia', 'CI-AR-'||gen_random_uuid(),'AR')
    RETURNING id INTO v_ar_pharmacy;
  INSERT INTO public.pharmacies(name,license_number,care_country)
    VALUES ('CI BR farmacia', 'CI-BR-'||gen_random_uuid(),'BR')
    RETURNING id INTO v_br_pharmacy;

  INSERT INTO public.pharmacists(user_id,pharmacy_id,license_number,full_name,role,active)
    VALUES(v_ar_pharmacist_user,v_ar_pharmacy,'CI-CRF-AR','Test pharmacist AR','pharmacist',true)
    RETURNING id,care_country INTO v_ar_pharmacist,v_actual_country;
  IF v_actual_country IS DISTINCT FROM 'AR' THEN RAISE EXCEPTION 'AR pharmacist jurisdiction not derived'; END IF;
  INSERT INTO public.pharmacists(user_id,pharmacy_id,license_number,full_name,role,active)
    VALUES(v_br_pharmacist_user,v_br_pharmacy,'CI-CRF-BR','Test pharmacist BR','pharmacist',true)
    RETURNING id,care_country INTO v_br_pharmacist,v_actual_country;
  IF v_actual_country IS DISTINCT FROM 'BR' THEN RAISE EXCEPTION 'BR pharmacist jurisdiction not derived'; END IF;

  v_rejected:=false;
  BEGIN
    INSERT INTO public.pharmacists(user_id,pharmacy_id,care_country,license_number,full_name,role)
      VALUES(v_br_pharmacist_user,v_ar_pharmacy,'BR','CI-INVALID','Invalid country pharmacist','pharmacist');
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Pharmacist assigned to wrong jurisdiction'; END IF;

  INSERT INTO public.prescriptions(patient_id,doctor_id,country_code,clinical_data,vendor_name,status)
    VALUES(v_ar_patient,v_ar_doctor,'AR','{}'::jsonb,'ci-pharmacy-test','draft')
    RETURNING id INTO v_rx;
  INSERT INTO public.dispensation_orders (
    prescription_id,patient_id,doctor_id,medication,formulation,
    quantity_units,duration_days,dispense_window_start,dispense_window_end,status
  ) VALUES (v_rx,v_ar_patient,v_ar_doctor,'Synthetic','tablet',1,30,current_date,current_date+30,'pending')
  RETURNING id,care_country INTO v_order,v_actual_country;
  IF v_actual_country IS DISTINCT FROM 'AR' THEN RAISE EXCEPTION 'Order did not inherit prescription country'; END IF;

  v_rejected:=false;
  BEGIN
    UPDATE public.dispensation_orders SET pharmacy_id=v_br_pharmacy,status='assigned' WHERE id=v_order;
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'BR pharmacy claimed AR order'; END IF;

  UPDATE public.dispensation_orders SET pharmacy_id=v_ar_pharmacy,status='assigned' WHERE id=v_order;

  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_validations(order_id,pharmacist_id,validation_type,result)
    VALUES(v_order,v_br_pharmacist,'patient_identity','pass');
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'BR pharmacist validated AR order'; END IF;

  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_events(
      order_id,pharmacist_id,pharmacy_id,dispense_status,
      dispensed_medication,dispensed_formulation,dispensed_quantity
    ) VALUES(v_order,v_br_pharmacist,v_br_pharmacy,'dispensed','Synthetic','tablet',1);
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'BR pharmacist dispensed AR order'; END IF;

  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_clarifications(
      order_id,requested_by,question,question_category,status,expires_at
    ) VALUES(
      v_order,v_br_pharmacist_user,'CI cross-country check','identity_concern',
      'pending',now()+interval '24 hours'
    );
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'BR pharmacist requested AR clarification'; END IF;

  -- Even a privileged database connection without the actual prescriber JWT
  -- cannot fabricate clinical verification/reconciliation.
  v_rejected:=false;
  BEGIN
    UPDATE public.dispensation_orders
      SET prescriber_verified=true, reconciliation_status='reconciled',
          clinician_decision='approved'
      WHERE id=v_order;
  EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Non-physician elevated clinical verification'; END IF;

  v_rejected:=false;
  BEGIN
    UPDATE public.dispensation_orders SET status='approved_for_dispensation' WHERE id=v_order;
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Unverified medical order approved automatically'; END IF;
END $behavior$;


ROLLBACK;
