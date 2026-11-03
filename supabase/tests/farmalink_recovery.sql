-- Local disposable Supabase only. No external requests and no production data.
BEGIN;

DO $privileges$
BEGIN
 IF has_function_privilege('anon', 'public.claim_farmalink_issue(uuid,text,uuid,jsonb,jsonb)', 'EXECUTE')
 OR has_function_privilege('authenticated', 'public.claim_farmalink_issue(uuid,text,uuid,jsonb,jsonb)', 'EXECUTE')
 OR has_function_privilege('anon', 'public.record_farmalink_issue(uuid,uuid,text,uuid,text,text)', 'EXECUTE')
 OR has_function_privilege('authenticated', 'public.record_farmalink_issue(uuid,uuid,text,uuid,text,text)', 'EXECUTE')
 THEN RAISE EXCEPTION 'Farmalink RPC must not be callable from browser roles'; END IF;
 IF NOT has_function_privilege('service_role', 'public.claim_farmalink_issue(uuid,text,uuid,jsonb,jsonb)', 'EXECUTE')
 THEN RAISE EXCEPTION 'Farmalink claim must be executable by server role'; END IF;
 IF has_table_privilege('anon','public.farmalink_issue_attempts','SELECT')
 OR has_table_privilege('authenticated','public.farmalink_issue_attempts','INSERT')
 THEN RAISE EXCEPTION 'Farmalink private table exposed'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.farmalink_issue_attempts'::regclass)
 THEN RAISE EXCEPTION 'Farmalink RLS disabled'; END IF;
END
$privileges$;

CREATE TEMP TABLE farmalink_fixture(uid uuid, other_uid uuid, prescription_id uuid, snapshot jsonb, PRIMARY KEY (prescription_id));
GRANT SELECT ON farmalink_fixture TO service_role;

DO $fixtures$
DECLARE
 actor_uid uuid := gen_random_uuid();
 stranger_uid uuid := gen_random_uuid();
 patient_uid uuid := gen_random_uuid();
 actor_id uuid := gen_random_uuid();
 patient_id uuid;
 rx_id uuid;
BEGIN
 INSERT INTO auth.users(id,email) VALUES
 (actor_uid, 'farmalink-claim-'||actor_uid||'@example.invalid'),
 (stranger_uid, 'farmalink-stranger-'||stranger_uid||'@example.invalid'),
 (patient_uid, 'farmalink-patient-'||patient_uid||'@example.invalid');
 UPDATE public.profiles SET role='doctor', active=true, sss_validation_status='valid' WHERE user_id=actor_uid;
 UPDATE public.profiles SET role='patient', active=true WHERE user_id=patient_uid;
 INSERT INTO public.doctors(id,user_id,license_type,license_number,specialty,active,refeps_id,professional_address)
 VALUES(actor_id,actor_uid,'MN','CI-'||actor_uid::text,'Clínica médica',true,'54123456789','Fixture CABA')
 ON CONFLICT(user_id) DO UPDATE SET license_type=excluded.license_type,
 license_number=excluded.license_number,active=true,refeps_id=excluded.refeps_id,
 professional_address=excluded.professional_address
 RETURNING id INTO actor_id;
 INSERT INTO public.patients(user_id,active) VALUES(patient_uid,true)
 ON CONFLICT(user_id) DO UPDATE SET active=true RETURNING id INTO patient_id;
 UPDATE public.patients SET care_country='AR' WHERE id=patient_id;
 INSERT INTO public.prescriptions(patient_id,doctor_id,country_code,clinical_data,vendor_name,status)
 VALUES(patient_id,actor_id,'AR','{}'::jsonb,'internal','draft')
 RETURNING id INTO rx_id;
 INSERT INTO farmalink_fixture VALUES(actor_uid,stranger_uid,rx_id,jsonb_build_object(
  'version',1,'prescriptionId',rx_id,'actorUserId',actor_uid,'doctorId',actor_id,'clinicalData','{}'::jsonb,
  'providerBaseUrl','https://test-servicios.farmalink.com.ar',
  'request',jsonb_build_object('synthetic',true),
  'pdfInput',jsonb_build_object('prescriptionId',rx_id,'existingCuir','02680042020102000000000000000000000010101',
   'issuedAt',now(),'expiresAt',now()+interval '30 days',
   'medication',jsonb_build_object('genericName','AMOXICILINA','dosage','500mg','presentation','Comprimidos','quantity',1,'instructions','Fixture'),
   'patient',jsonb_build_object('name','Paciente Fixture','dni','30123456','address','CABA'),
   'prescriber',jsonb_build_object('name','Medico Fixture','license','1234567','professionalAddress','CABA','refeps','54123456789')),
  'dispensationOrder',jsonb_build_object('prescription_type','standard','medication','AMOXICILINA','formulation','500mg',
   'quantity_units',1,'duration_days',30,'dispense_window_start',current_date,'dispense_window_end',current_date+30,
   'clinical_semaphore','green','requires_clarification',false,'drug_category','default','is_controlled_substance',false)));

END
$fixtures$;


CREATE TEMP TABLE farmalink_admin(uid uuid);
GRANT SELECT ON farmalink_admin TO service_role;
INSERT INTO farmalink_admin VALUES(gen_random_uuid());
INSERT INTO auth.users(id,email) SELECT uid,'farmalink-admin-'||uid||'@example.invalid' FROM farmalink_admin;
UPDATE public.profiles SET role='admin',active=true WHERE user_id=(SELECT uid FROM farmalink_admin);
SET LOCAL ROLE service_role;
DO $tests$
DECLARE x farmalink_fixture%ROWTYPE; c jsonb; a uuid; adm uuid; r jsonb; n integer; v_status text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
  WHERE n.nspname='public' AND f.proname LIKE '%farmalink%'
  AND (has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE')))
 THEN RAISE EXCEPTION 'browser can execute Farmalink RPC'; END IF;
 IF has_table_privilege('anon','public.farmalink_operation_events','SELECT')
  OR has_table_privilege('authenticated','public.farmalink_operation_events','INSERT')
  OR has_table_privilege('service_role','public.farmalink_operation_events','UPDATE')
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.farmalink_operation_events'::regclass)
 THEN RAISE EXCEPTION 'private Farmalink audit ACL/RLS mismatch'; END IF;
 SELECT * INTO x FROM farmalink_fixture LIMIT 1;
 SELECT uid INTO adm FROM farmalink_admin;
 c:=public.claim_farmalink_issue(x.prescription_id,repeat('a',64),x.uid,'{}',x.snapshot);
 a:=(c->>'attempt_id')::uuid;
 BEGIN
  PERFORM public.get_farmalink_recovery(x.prescription_id,x.uid);
  RAISE EXCEPTION 'reserved was recoverable';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 BEGIN
  UPDATE public.farmalink_issue_attempts SET issue_snapshot='{}' WHERE prescription_id=x.prescription_id;
  RAISE EXCEPTION 'snapshot was mutable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT public.record_farmalink_issue(x.prescription_id,a,'unknown',x.uid) THEN RAISE EXCEPTION 'unknown failed'; END IF;
 BEGIN
  PERFORM public.list_farmalink_pending(x.uid,100);
  RAISE EXCEPTION 'doctor saw admin queue';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF jsonb_array_length(public.list_farmalink_pending(adm,100))<>1 THEN RAISE EXCEPTION 'pending missing'; END IF;
 r:=public.get_farmalink_reconciliation_context(x.prescription_id,adm);
 IF r->>'attempt_id'<>a::text THEN RAISE EXCEPTION 'wrong context'; END IF;
 IF NOT public.reconcile_farmalink_issue(x.prescription_id,a,adm,'9600000002992',repeat('a',64),repeat('b',64),
  encode(sha256(convert_to('{}','UTF8')),'hex'),'SOL-3144/synthetic','{}') THEN RAISE EXCEPTION 'reconcile failed'; END IF;
 IF public.reconcile_farmalink_issue(x.prescription_id,a,adm,'9600000002993',repeat('a',64),repeat('b',64),
  encode(sha256(convert_to('{}','UTF8')),'hex'),'SOL-3144/synthetic','{}') THEN RAISE EXCEPTION 'reconciled twice'; END IF;
 BEGIN
  PERFORM public.get_farmalink_recovery(x.prescription_id,x.other_uid);
  RAISE EXCEPTION 'stranger recovered';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 FOREACH v_status IN ARRAY ARRAY['cancelled','expired'] LOOP
  UPDATE public.prescriptions SET status=v_status WHERE id=x.prescription_id;
  BEGIN
   PERFORM public.complete_farmalink_artifact(x.prescription_id,a,x.uid,
    'prescriptions/'||(x.snapshot#>>'{pdfInput,existingCuir}')||'/blocked.pdf',repeat('c',64),
    'electronic_simple','https://example.invalid/blocked.pdf','recovery');
   RAISE EXCEPTION 'closed prescription resurrected';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 END LOOP;
 UPDATE public.prescriptions SET status='draft' WHERE id=x.prescription_id;
 UPDATE public.profiles SET active=false WHERE user_id=x.uid;
 BEGIN
  PERFORM public.complete_farmalink_artifact(x.prescription_id,a,x.uid,
   'prescriptions/'||(x.snapshot#>>'{pdfInput,existingCuir}')||'/blocked.pdf',repeat('c',64),
   'electronic_simple','https://example.invalid/blocked.pdf','recovery');
  RAISE EXCEPTION 'disabled profile finalized';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.profiles SET active=true WHERE user_id=x.uid;
 UPDATE public.farmalink_issue_attempts SET response_code=NULL WHERE prescription_id=x.prescription_id;
 BEGIN
  PERFORM public.get_farmalink_recovery(x.prescription_id,x.uid);
  RAISE EXCEPTION 'NULL functional code accepted';
 EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
 UPDATE public.farmalink_issue_attempts SET response_code='00' WHERE prescription_id=x.prescription_id;
 r:=public.get_farmalink_recovery(x.prescription_id,x.uid);
 IF r#>>'{snapshot,pdfInput,existingCuir}'<>x.snapshot#>>'{pdfInput,existingCuir}' THEN RAISE EXCEPTION 'snapshot lost'; END IF;
 r:=public.complete_farmalink_artifact(x.prescription_id,a,x.uid,
  'prescriptions/'||(x.snapshot#>>'{pdfInput,existingCuir}')||'/synthetic.pdf',repeat('c',64),
  'electronic_simple','https://example.invalid/synthetic.pdf','recovery');
 IF r->>'issued_at'<>x.snapshot#>>'{pdfInput,issuedAt}' OR r->>'expires_at'<>x.snapshot#>>'{pdfInput,expiresAt}'
 THEN RAISE EXCEPTION 'recovery changed validity'; END IF;
 PERFORM public.complete_farmalink_artifact(x.prescription_id,a,x.uid,
  'prescriptions/'||(x.snapshot#>>'{pdfInput,existingCuir}')||'/second.pdf',repeat('d',64),
  'electronic_simple','https://example.invalid/second.pdf','recovery');
 SELECT count(*) INTO n FROM public.dispensation_orders WHERE prescription_id=x.prescription_id;
 IF n<>1 THEN RAISE EXCEPTION 'duplicate dispensation order'; END IF;
 IF (SELECT artifact_path FROM public.farmalink_issue_attempts WHERE prescription_id=x.prescription_id)
 <> 'prescriptions/'||(x.snapshot#>>'{pdfInput,existingCuir}')||'/synthetic.pdf' THEN RAISE EXCEPTION 'artifact overwritten'; END IF;
 IF (SELECT count(*) FROM public.farmalink_operation_events WHERE prescription_id=x.prescription_id)<>3
 THEN RAISE EXCEPTION 'operation audit incomplete'; END IF;
 BEGIN
  UPDATE public.farmalink_operation_events SET provider_reference='changed' WHERE prescription_id=x.prescription_id;
  RAISE EXCEPTION 'audit mutable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: snapshot, reconciliation roles, evidence, original validity, one order, immutable audit and artifact reuse';
END $tests$;
RESET ROLE;
DO $privileged_audit$
BEGIN
 BEGIN
  UPDATE public.farmalink_operation_events SET provider_reference='forged'
  WHERE prescription_id=(SELECT prescription_id FROM farmalink_fixture LIMIT 1);
  RAISE EXCEPTION 'privileged audit mutation succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $privileged_audit$;
ROLLBACK;
