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
        AND column_name='care_country' AND is_nullable='YES'
    ) THEN RAISE EXCEPTION 'Missing nullable historical quarantine country on %',v_table; END IF;
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
  v_rejected:=false;
  BEGIN
    INSERT INTO public.pharmacies(name,license_number)
    VALUES('CI missing jurisdiction','CI-PHARM-NULL-'||gen_random_uuid());
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'New pharmacy accepted an unknown country'; END IF;
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


-- Signup creates an account/profile, never a licensed membership by metadata.
DO $signup$
DECLARE v_user uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data)
  VALUES(v_user,'ci-pharmacy-signup-'||v_user||'@example.invalid','{"role":"pharmacist"}'::jsonb);
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=v_user AND role::text='pharmacist') THEN
    RAISE EXCEPTION 'Pharmacist signup failed to create its profile';
  END IF;
  IF EXISTS(SELECT 1 FROM public.pharmacists WHERE user_id=v_user) THEN
    RAISE EXCEPTION 'Signup metadata created unlicensed pharmacy membership';
  END IF;
END $signup$;

-- Full transaction-only jurisdiction regression: two physician/patient markets,
-- two pharmacies, licensed pharmacists, and an assigned dispensation order.
CREATE FUNCTION pg_temp.pharmacy_inject_finalize_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('autamedica.test_delivery_failure',true)='on' THEN
    RAISE EXCEPTION 'isolated_delivery_finalize_failure';
  END IF;
  RETURN NEW;
END $$;

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
  v_event uuid:=gen_random_uuid();
  v_clarification uuid;
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
  UPDATE public.profiles SET role='pharmacist',active=true WHERE user_id IN(v_ar_pharmacist_user,v_br_pharmacist_user);

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
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_ar_doctor_user,'role','authenticated')::text,true);
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

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_ar_pharmacist_user,'role','authenticated')::text,true);
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

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_br_pharmacist_user,'role','authenticated')::text,true);
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
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_ar_pharmacist_user,'role','authenticated')::text,true);

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

  -- INSERT may not pre-attest a recipe, even for the actual prescriber.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_ar_doctor_user,'role','authenticated')::text,true);
  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_orders(prescription_id,patient_id,doctor_id,medication,formulation,
      quantity_units,duration_days,dispense_window_start,dispense_window_end,prescriber_verified)
    VALUES(v_rx,v_ar_patient,v_ar_doctor,'Synthetic','tablet',1,30,current_date,current_date+30,true);
  EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'INSERT fabricated prescriber verification'; END IF;

  -- Real authenticated pharmacist, not the database owner: valid same-country
  -- operations must work even though raw physician/patient records remain hidden.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_ar_pharmacist_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.dispensation_orders SET status='under_review' WHERE id=v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authenticated pharmacist could not start same-country review'; END IF;
  INSERT INTO public.dispensation_validations(order_id,pharmacist_id,validation_type,result)
    SELECT v_order,v_ar_pharmacist,kind,'pass' FROM unnest(ARRAY[
      'patient_identity','prescriber_identity','medication_match','formulation_match','quantity_check','validity_check']) kind;

  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_validations(order_id,pharmacist_id,validation_type,result,override_reason,override_authorized_by)
    VALUES(v_order,v_ar_pharmacist,'dose_check','overridden','Synthetic attempted override',v_ar_pharmacist);
  EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Nondirector pharmacist authorized own override'; END IF;

  INSERT INTO public.dispensation_clarifications(order_id,requested_by,question,question_category)
  VALUES(v_order,v_ar_pharmacist_user,'Isolated synthetic clarification','other') RETURNING id INTO v_clarification;
  IF (SELECT status FROM public.dispensation_orders WHERE id=v_order)<>'clarification_requested'
     OR (SELECT count(*) FROM public.pharmacy_audit_events WHERE order_id=v_order AND event_type='clarification_requested')<>1 THEN
    RAISE EXCEPTION 'Clarification request was not finalized transactionally';
  END IF;
  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_clarifications(order_id,requested_by,question,question_category)
    VALUES(v_order,v_ar_pharmacist_user,'Isolated duplicate clarification','other');
  EXCEPTION WHEN unique_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Duplicate pending clarification was accepted'; END IF;


  -- No direct event creation from a merely reviewed, unsigned order.
  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_events(id,order_id,pharmacist_id,pharmacy_id,dispense_status,
      dispensed_medication,dispensed_formulation,dispensed_quantity)
    VALUES(gen_random_uuid(),v_order,v_ar_pharmacist,v_ar_pharmacy,'dispensed','Synthetic','tablet',1);
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Direct authenticated event bypassed clinical approval'; END IF;
  EXECUTE 'RESET ROLE';

  -- Clinical attestation is a real physician session. It is not signature proof.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_ar_doctor_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.dispensation_clarifications SET status='responded',response='Synthetic clinical response',
    response_decision='confirmed',responded_by=v_ar_doctor_user WHERE id=v_clarification;
  IF (SELECT status FROM public.dispensation_orders WHERE id=v_order)<>'clarification_provided' THEN
    RAISE EXCEPTION 'Prescriber clarification response did not advance state transactionally';
  END IF;
  v_rejected:=false;
  BEGIN
    UPDATE public.doctors SET enabled_service_tiers=ARRAY['general'] WHERE id=v_ar_doctor;
  EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Physician self-authorized a clinical service'; END IF;
  UPDATE public.dispensation_orders SET prescriber_verified=true,reconciliation_status='reconciled',
    clinician_decision='approved',quantity_units=2 WHERE id=v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Responsible physician could not attest clinical review'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_ar_pharmacist_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_rejected:=false;
  BEGIN
    UPDATE public.dispensation_orders SET status='approved_for_dispensation' WHERE id=v_order;
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Clinical flags were mistaken for verified signature evidence'; END IF;
  EXECUTE 'RESET ROLE';

  -- A synthetic verifier fixture is created only inside the isolated rolled-back
  -- transaction by the DB owner. Application roles cannot populate this ledger.
  UPDATE public.prescriptions SET status='signed',signed_pdf_url='synthetic://pharmacy-ci.pdf' WHERE id=v_rx;
  INSERT INTO app_private.pharmacy_prescription_release_evidence(
    prescription_id,doctor_id,patient_id,care_country,clinical_snapshot,signed_pdf_url,
    document_sha256,certificate_sha256,verifier_reference,provider_authorization_reference,verified_at,order_snapshot)
  VALUES(v_rx,v_ar_doctor,v_ar_patient,'AR','{}'::jsonb,'synthetic://pharmacy-ci.pdf',
    repeat('0',64),repeat('1',64),'isolated-ci-fixture-not-real-signature','isolated-ci-no-real-authority',now(),
    (SELECT jsonb_build_object('medication',medication,'formulation',formulation,
      'dose_mg_per_day',dose_mg_per_day,'quantity_units',quantity_units,'duration_days',duration_days,
      'prescription_type',prescription_type,'dispense_window_start',dispense_window_start,'dispense_window_end',dispense_window_end)
      FROM public.dispensation_orders WHERE id=v_order));

  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.dispensation_orders SET status='approved_for_dispensation' WHERE id=v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified synthetic same-country order could not be approved'; END IF;
  INSERT INTO public.dispensation_events(id,order_id,pharmacist_id,pharmacy_id,dispense_status,
    dispensed_medication,dispensed_formulation,dispensed_quantity)
  VALUES(v_event,v_order,v_ar_pharmacist,v_ar_pharmacy,'dispensed','Synthetic','tablet',1);
  IF (SELECT status FROM public.dispensation_orders WHERE id=v_order)<>'partially_dispensed' THEN
    RAISE EXCEPTION 'Delivery insert did not transactionally finalize partial order status';
  END IF;

  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_events(id,order_id,pharmacist_id,pharmacy_id,dispense_status,
      dispensed_medication,dispensed_formulation,dispensed_quantity)
    VALUES(v_event,v_order,v_ar_pharmacist,v_ar_pharmacy,'dispensed','Synthetic','tablet',1);
  EXCEPTION WHEN unique_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Same delivery UUID inserted twice'; END IF;
  IF (SELECT count(*) FROM public.dispensation_events WHERE order_id=v_order)<>1 THEN
    RAISE EXCEPTION 'Retry duplicated delivery records';
  END IF;

  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_events(id,order_id,pharmacist_id,pharmacy_id,dispense_status,
      dispensed_medication,dispensed_formulation,dispensed_quantity)
    VALUES(gen_random_uuid(),v_order,v_ar_pharmacist,v_ar_pharmacy,'dispensed','Synthetic','tablet',2);
  EXCEPTION WHEN check_violation THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Direct event over-dispensed remaining quantity'; END IF;

  -- Inject a failure after the event INSERT reaches finalization. The entire
  -- event/order/prescription/audit unit must roll back, not just its last write.
  EXECUTE 'RESET ROLE';
  EXECUTE 'CREATE TRIGGER isolated_delivery_failure BEFORE UPDATE OF status ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION pg_temp.pharmacy_inject_finalize_failure()';
  PERFORM set_config('autamedica.test_delivery_failure','on',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_rejected:=false;
  BEGIN
    INSERT INTO public.dispensation_events(id,order_id,pharmacist_id,pharmacy_id,dispense_status,
      dispensed_medication,dispensed_formulation,dispensed_quantity)
    VALUES(gen_random_uuid(),v_order,v_ar_pharmacist,v_ar_pharmacy,'dispensed','Synthetic','tablet',1);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'isolated_delivery_finalize_failure' THEN RAISE; END IF;
    v_rejected:=true;
  END;
  IF NOT v_rejected OR (SELECT count(*) FROM public.dispensation_events WHERE order_id=v_order)<>1
     OR (SELECT status FROM public.dispensation_orders WHERE id=v_order)<>'partially_dispensed'
     OR (SELECT count(*) FROM public.pharmacy_audit_events WHERE order_id=v_order AND event_type='dispensation_executed')<>1 THEN
    RAISE EXCEPTION 'Partial finalization failure left committed delivery/state/audit';
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('autamedica.test_delivery_failure','off',true);
  EXECUTE 'DROP TRIGGER isolated_delivery_failure ON public.prescriptions';
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.dispensation_events(id,order_id,pharmacist_id,pharmacy_id,dispense_status,
    dispensed_medication,dispensed_formulation,dispensed_quantity)
  VALUES(gen_random_uuid(),v_order,v_ar_pharmacist,v_ar_pharmacy,'dispensed','Synthetic','tablet',1);
  IF (SELECT status FROM public.dispensation_orders WHERE id=v_order)<>'dispensed' THEN
    RAISE EXCEPTION 'Delivery did not finalize order';
  END IF;
  IF (SELECT count(*) FROM public.pharmacy_audit_events WHERE order_id=v_order AND event_type='dispensation_executed')<>2 THEN
    RAISE EXCEPTION 'Delivery lacks transactional audit';
  END IF;
  EXECUTE 'RESET ROLE';
  IF (SELECT status FROM public.prescriptions WHERE id=v_rx)<>'dispensed_total' THEN
    RAISE EXCEPTION 'Delivery did not finalize original prescription';
  END IF;

  v_rejected:=false;
  BEGIN
    UPDATE public.dispensation_events SET dispensed_quantity=10 WHERE id=v_event;
  EXCEPTION WHEN insufficient_privilege THEN v_rejected:=true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Privileged client rewrote immutable delivery'; END IF;

  -- Revoking the profile blocks membership even if pharmacist.active remains true.
  UPDATE public.profiles SET active=false WHERE user_id=v_ar_pharmacist_user;
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF app_private.pharmacy_actor_authorized(v_ar_pharmacy,'AR') THEN
    RAISE EXCEPTION 'Revoked profile retained pharmacy authorization';
  END IF;
  IF EXISTS(SELECT 1 FROM public.dispensation_orders WHERE id=v_order) THEN
    RAISE EXCEPTION 'Revoked profile retained order visibility';
  END IF;
  EXECUTE 'RESET ROLE';

END $behavior$;


ROLLBACK;

