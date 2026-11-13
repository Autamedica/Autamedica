-- Positive Brazil dispensing lifecycle, with synthetic credentials and signature
-- evidence. This tests application authorization/state only, not a real CRM,
-- external signature provider or commercial QR dispensing authorization.
BEGIN;
DO $$ BEGIN
  IF current_setting('autamedica.isolated_test',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'brazil_lifecycle_requires_isolated_test';
  END IF;
END $$;
DO $brazil$
DECLARE
  v_doctor_user uuid:=gen_random_uuid();
  v_patient_user uuid:=gen_random_uuid();
  v_pharmacist_user uuid:=gen_random_uuid();
  v_reviewer_user uuid:=gen_random_uuid();
  v_doctor uuid:=gen_random_uuid();
  v_patient uuid;
  v_pharmacy uuid:=gen_random_uuid();
  v_pharmacist uuid:=gen_random_uuid();
  v_rx uuid;
  v_order uuid;
  v_event uuid:=gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email) VALUES
    (v_doctor_user,'isolated-br-doctor-'||v_doctor_user||'@example.invalid'),
    (v_patient_user,'isolated-br-patient-'||v_patient_user||'@example.invalid'),
    (v_pharmacist_user,'isolated-br-pharmacist-'||v_pharmacist_user||'@example.invalid'),
    (v_reviewer_user,'isolated-br-cfm-reviewer-'||v_reviewer_user||'@example.invalid');
  UPDATE public.profiles SET role='doctor',active=true WHERE user_id=v_doctor_user;
  UPDATE public.profiles SET role='pharmacist',active=true WHERE user_id=v_pharmacist_user;
  UPDATE public.profiles SET role='admin',active=true WHERE user_id=v_reviewer_user;
  INSERT INTO public.doctors(id,user_id,license_number,license_type,uf_brazil,specialty,active,care_country)
    VALUES(v_doctor,v_doctor_user,'CI-SYNTHETIC-NO-REAL-CRM','CRM','RS','Synthetic BR general',true,'BR')
    ON CONFLICT(user_id) DO UPDATE SET license_number=excluded.license_number,
      license_type='CRM',uf_brazil='RS',active=true,care_country='BR';
  SELECT id INTO STRICT v_doctor FROM public.doctors WHERE user_id=v_doctor_user;
  INSERT INTO public.doctor_licenses(
    doctor_id,license_type,license_number,uf_brazil,status,cfm_validation_status,
    cfm_evidence_path,cfm_review_notes,cfm_reviewed_by,cfm_reviewed_at,cfm_last_checked_at
  ) VALUES(
    v_doctor,'CRM','CI-SYNTHETIC-NO-REAL-CRM','RS','active','valid',
    'ci/'||v_doctor::text||'/synthetic-cfm-evidence.pdf',
    'Synthetic administrator-reviewed CFM evidence for isolated lifecycle test',
    v_reviewer_user,now(),now()
  );
  SELECT id INTO STRICT v_patient FROM public.patients WHERE user_id=v_patient_user;
  IF (SELECT care_country FROM public.doctors WHERE id=v_doctor)<>'BR' THEN
    RAISE EXCEPTION 'Synthetic CRM/UF physician did not remain BR';
  END IF;

  -- The patient selects care country through their own real authenticated role.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_patient_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.patients SET care_country='BR' WHERE id=v_patient;
  IF NOT FOUND THEN RAISE EXCEPTION 'BR patient could not establish own country'; END IF;
  EXECUTE 'RESET ROLE';
  INSERT INTO public.pharmacies(id,name,license_number,care_country)
    VALUES(v_pharmacy,'Isolated BR dispensing establishment','CI-NO-REAL-REGISTRATION-'||v_pharmacy,'BR');
  INSERT INTO public.pharmacists(id,user_id,pharmacy_id,license_number,role,active)
    VALUES(v_pharmacist,v_pharmacist_user,v_pharmacy,'CI-SYNTHETIC-NO-REAL-CRF','pharmacist',true);

  -- Real physician JWT and authenticated RLS apply to recipe/order creation.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_doctor_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.prescriptions(patient_id,doctor_id,country_code,clinical_data,vendor_name,status)
    VALUES(v_patient,v_doctor,'BR','{"fixture":"isolated-BR-no-real-medical-document"}'::jsonb,
      'isolated-no-real-provider','draft') RETURNING id INTO v_rx;
  INSERT INTO public.dispensation_orders(prescription_id,patient_id,doctor_id,medication,formulation,
    quantity_units,duration_days,dispense_window_start,dispense_window_end)
    VALUES(v_rx,v_patient,v_doctor,'Synthetic BR medicine','tablet',3,30,current_date,current_date+30)
    RETURNING id INTO v_order;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_pharmacist_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.dispensation_orders SET pharmacy_id=v_pharmacy,status='assigned'
    WHERE id=v_order AND pharmacy_id IS NULL AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'BR pharmacist could not claim same-country order'; END IF;
  UPDATE public.dispensation_orders SET status='under_review' WHERE id=v_order;
  INSERT INTO public.dispensation_validations(order_id,pharmacist_id,validation_type,result)
    SELECT v_order,v_pharmacist,kind,'pass' FROM unnest(ARRAY['patient_identity','prescriber_identity',
      'medication_match','formulation_match','quantity_check','validity_check']) kind;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_doctor_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.dispensation_orders SET prescriber_verified=true,reconciliation_status='reconciled',
    clinician_decision='approved' WHERE id=v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'Responsible BR physician could not attest clinical review'; END IF;
  UPDATE public.prescriptions SET status='signed',signed_pdf_url='synthetic://brazil-lifecycle/'||v_rx||'.pdf'
    WHERE id=v_rx;
  EXECUTE 'RESET ROLE';

  -- Only the isolated DB owner fabricates fixture evidence; no app role has a
  -- writer grant. These fake hashes/references confer no production authority.
  INSERT INTO app_private.pharmacy_prescription_release_evidence(prescription_id,doctor_id,patient_id,
    care_country,clinical_snapshot,signed_pdf_url,document_sha256,certificate_sha256,
    verifier_reference,provider_authorization_reference,verified_at,order_snapshot)
  SELECT rx.id,rx.doctor_id,rx.patient_id,'BR',rx.clinical_data,rx.signed_pdf_url,repeat('2',64),repeat('3',64),
    'isolated-BR-not-real-signature','isolated-BR-not-real-provider-authority',now(),
    jsonb_build_object('medication',o.medication,'formulation',o.formulation,'dose_mg_per_day',o.dose_mg_per_day,
      'quantity_units',o.quantity_units,'duration_days',o.duration_days,'prescription_type',o.prescription_type,
      'dispense_window_start',o.dispense_window_start,'dispense_window_end',o.dispense_window_end)
  FROM public.prescriptions rx JOIN public.dispensation_orders o ON o.prescription_id=rx.id WHERE o.id=v_order;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_pharmacist_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.dispensation_orders SET status='approved_for_dispensation' WHERE id=v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'BR order did not pass clinical release gate'; END IF;
  INSERT INTO public.dispensation_events(id,order_id,pharmacist_id,pharmacy_id,dispense_status,
    dispensed_medication,dispensed_formulation,dispensed_quantity)
    VALUES(v_event,v_order,v_pharmacist,v_pharmacy,'dispensed','Synthetic BR medicine','tablet',3);
  IF (SELECT status FROM public.dispensation_orders WHERE id=v_order)<>'dispensed'
     OR (SELECT sum(dispensed_quantity) FROM public.dispensation_events WHERE order_id=v_order)<>3
     OR (SELECT count(*) FROM public.pharmacy_audit_events WHERE order_id=v_order AND event_type='dispensation_executed')<>1 THEN
    RAISE EXCEPTION 'BR delivery/order/audit did not commit consistently';
  END IF;
  EXECUTE 'RESET ROLE';
  IF (SELECT status FROM public.prescriptions WHERE id=v_rx)<>'dispensed_total'
     OR (SELECT country_code FROM public.prescriptions WHERE id=v_rx)<>'BR'
     OR (SELECT care_country FROM public.dispensation_orders WHERE id=v_order)<>'BR'
     OR (SELECT care_country FROM public.patients WHERE id=v_patient)<>'BR' THEN
    RAISE EXCEPTION 'BR lifecycle failed prescription finalization or jurisdiction preservation';
  END IF;
  RAISE NOTICE 'Synthetic authenticated BR prescription/order/validation/attestation/delivery lifecycle passed';
END $brazil$;
ROLLBACK;
