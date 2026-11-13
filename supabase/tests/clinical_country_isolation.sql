-- Disposable database ONLY. All synthetic fixtures roll back; no dispatch pushes.
BEGIN;
DO $$ BEGIN
  IF current_setting('autamedica.isolated_test',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'isolated_test must be on';
  END IF;
END $$;
CREATE TEMP TABLE country_fixture(kind text PRIMARY KEY,uid uuid,id uuid);
GRANT SELECT ON country_fixture TO authenticated,service_role,anon;
INSERT INTO country_fixture VALUES
 ('patient_ar',gen_random_uuid(),gen_random_uuid()),
 ('patient_br',gen_random_uuid(),gen_random_uuid()),
 ('patient_unknown',gen_random_uuid(),gen_random_uuid()),
 ('doctor_ar',gen_random_uuid(),gen_random_uuid()),
 ('doctor_br',gen_random_uuid(),gen_random_uuid());
INSERT INTO auth.users(id,email)
 SELECT uid,'country-ci-'||uid||'@example.invalid' FROM country_fixture;
UPDATE public.profiles p SET role=CASE WHEN f.kind LIKE 'doctor%' THEN 'doctor' ELSE 'patient' END,active=true
 FROM country_fixture f WHERE p.user_id=f.uid;
INSERT INTO public.patients(user_id,active)
 SELECT uid,true FROM country_fixture WHERE kind LIKE 'patient%'
 ON CONFLICT(user_id) DO NOTHING;
UPDATE public.patients p SET care_country=CASE f.kind WHEN 'patient_ar' THEN 'AR' WHEN 'patient_br' THEN 'BR' END
 FROM country_fixture f WHERE p.user_id=f.uid AND f.kind LIKE 'patient%';
UPDATE country_fixture f SET id=p.id FROM public.patients p WHERE p.user_id=f.uid AND f.kind LIKE 'patient%';
INSERT INTO public.doctors(id,user_id,license_type,license_number,uf_brazil,specialty,active)
 SELECT id,uid,CASE kind WHEN 'doctor_br' THEN 'CRM' ELSE 'MN' END,
 'CI-'||id::text,CASE kind WHEN 'doctor_br' THEN 'RS' ELSE NULL END,'CI country isolation',true
 FROM country_fixture WHERE kind LIKE 'doctor%'
 ON CONFLICT(user_id) DO UPDATE SET license_type=excluded.license_type,
 license_number=excluded.license_number,uf_brazil=excluded.uf_brazil,active=true;
UPDATE country_fixture f SET id=d.id FROM public.doctors d WHERE d.user_id=f.uid AND f.kind LIKE 'doctor%';
-- A secondary credential must never relabel the primary doctor's market.
INSERT INTO public.doctor_licenses(doctor_id,license_type,license_number,uf_brazil,status)
 SELECT id,'CRM','765432','SP','active' FROM country_fixture WHERE kind='doctor_ar';
INSERT INTO public.doctor_licenses(doctor_id,license_type,license_number,status)
 SELECT id,'MN','765432','active' FROM country_fixture WHERE kind='doctor_br';

-- Only Admin-approved clinicians may appear in the guard radar. Positive
-- synthetic fixtures must carry their country's own verified credentials.
UPDATE public.profiles p SET sss_validation_status='valid'
FROM country_fixture f WHERE p.user_id=f.uid AND f.kind='doctor_ar';

INSERT INTO public.doctor_licenses(doctor_id,license_type,license_number,province,status)
SELECT id,'MN','CI-'||id::text,'CABA','active'
FROM country_fixture WHERE kind='doctor_ar';

INSERT INTO public.doctor_licenses(doctor_id,license_type,license_number,uf_brazil,status,cfm_validation_status,
  cfm_evidence_path,cfm_review_notes,cfm_reviewed_by,cfm_reviewed_at,cfm_last_checked_at)
SELECT id,'CRM','CI-'||id::text,'RS','active','valid',
  'ci/'||id::text||'/evidence.pdf','Synthetic CI administrative review',uid,now(),now()
FROM country_fixture WHERE kind='doctor_br';

-- An active AR doctor with a current licence but no Admin approval
-- must not be listed to patients.
DO $pending_directory$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_doc_id uuid;
BEGIN
  INSERT INTO auth.users(id,email)
  VALUES(v_uid,'pending-country-ci-'||v_uid||'@example.invalid');
  UPDATE public.profiles SET role='doctor',active=true,
    sss_validation_status='pending_review' WHERE user_id=v_uid;
  SELECT id INTO v_doc_id FROM public.doctors WHERE user_id=v_uid LIMIT 1;
  IF v_doc_id IS NULL THEN
    INSERT INTO public.doctors(user_id,license_type,license_number,specialty,active)
    VALUES(v_uid,'MN','CI-PENDING-NO-ADMIN','Synthetic',true)
    RETURNING id INTO v_doc_id;
  ELSE
    UPDATE public.doctors SET license_type='MN',license_number='CI-PENDING-NO-ADMIN',active=true
    WHERE id=v_doc_id;
  END IF;
  INSERT INTO public.doctor_licenses(doctor_id,license_type,license_number,province,status)
  VALUES(v_doc_id,'MN','CI-PENDING-NO-ADMIN','CABA','active');
END;
$pending_directory$;

-- Synthetic historical data only: verify country hardening preserves cleanup.
ALTER TABLE public.doctor_patient DISABLE TRIGGER trg_country_pair;
INSERT INTO public.doctor_patient(patient_id,doctor_id)
 SELECT p.id,d.id FROM country_fixture p,country_fixture d
 WHERE p.kind='patient_unknown' AND d.kind='doctor_ar';
ALTER TABLE public.doctor_patient ENABLE TRIGGER trg_country_pair;
ALTER TABLE public.conversation_sessions DISABLE TRIGGER trg_country_optional_physician;
INSERT INTO public.conversation_sessions(patient_id,doctor_id,case_id,channel,workflow_type,status,started_at)
 SELECT p.id,d.id,'ci-country-legacy-'||p.id,'chat','anamnesis','active',now()-interval '1 day'
 FROM country_fixture p,country_fixture d WHERE p.kind='patient_unknown' AND d.kind='doctor_ar';
ALTER TABLE public.conversation_sessions ENABLE TRIGGER trg_country_optional_physician;
UPDATE public.conversation_sessions SET status='failed',ended_at=now()
 WHERE case_id LIKE 'ci-country-legacy-%';
DO $$ BEGIN
  BEGIN
    UPDATE public.conversation_sessions SET status='active',ended_at=null
     WHERE case_id LIKE 'ci-country-legacy-%';
    RAISE EXCEPTION 'Legacy unknown-country conversation resumed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.doctor_duty_status(doctor_id,is_on_duty,last_heartbeat_at,duty_started_at)
 SELECT id,true,now(),now() FROM country_fixture WHERE kind LIKE 'doctor%'
 ON CONFLICT(doctor_id) DO UPDATE SET is_on_duty=true,last_heartbeat_at=now();
UPDATE public.profiles SET matricula_nacional='CI-AR-SECONDARY'
 WHERE user_id=(SELECT uid FROM country_fixture WHERE kind='doctor_br');

-- Simulate a scoped legacy RPC: SECURITY DEFINER must not turn the caller into
-- a trusted provisioner merely because the function executes as postgres.
CREATE FUNCTION pg_temp.country_definer_attempt(p_patient uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.patients SET care_country='AR' WHERE id=p_patient;
$$;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated',
    (SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema()));
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.country_definer_attempt(uuid) TO authenticated;
SET LOCAL ROLE authenticated;
DO $patient_checks$
DECLARE market text; v_uid uuid; v_country text; v_id uuid;
BEGIN
  FOREACH market IN ARRAY ARRAY['ar','br','unknown'] LOOP
    SELECT uid INTO v_uid FROM country_fixture WHERE kind='patient_'||market;
    v_country := CASE market WHEN 'ar' THEN 'AR' WHEN 'br' THEN 'BR' END;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_uid)::text,true);
    IF EXISTS(SELECT 1 FROM public.doctors) THEN
      RAISE EXCEPTION 'Directory leak for %',market;
    END IF;
    IF market='unknown' AND EXISTS(SELECT 1 FROM public.doctors) THEN
      RAISE EXCEPTION 'Unknown country directory did not fail closed';
    END IF;
    IF market <> 'unknown' AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(public.get_patient_doctor_directory()) d
      JOIN country_fixture f ON f.id::text=d->>'id' WHERE f.kind='doctor_'||market
    ) THEN RAISE EXCEPTION 'Matching doctor hidden for %',market; END IF;
    IF market='ar' AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(public.get_patient_doctor_directory()) d
      WHERE d->>'license_number'='CI-PENDING-NO-ADMIN'
    ) THEN RAISE EXCEPTION 'Pending unapproved doctor exposed in AR directory'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_patient_doctor_directory()) d
      WHERE d->>'care_country' IS DISTINCT FROM v_country
         OR (v_country='BR' AND d#>>'{profile,matricula_nacional}' IS NOT NULL)
         OR (v_country='AR' AND d->>'uf_brazil' IS NOT NULL)) THEN
      RAISE EXCEPTION 'Curated directory exposes mixed credentials';
    END IF;
    IF EXISTS(SELECT 1 FROM public.doctor_licenses l
      WHERE (market='ar' AND l.license_type='CRM')
         OR (market='br' AND l.license_type IN ('MN','MP'))
         OR market='unknown') THEN RAISE EXCEPTION 'Credential country leak for %',market; END IF;
    IF EXISTS(SELECT 1 FROM public.profiles p JOIN country_fixture f ON p.user_id=f.uid
      WHERE f.kind LIKE 'doctor%' AND (market='unknown' OR f.kind <> 'doctor_'||market)) THEN
      RAISE EXCEPTION 'Doctor profile leak for %',market;
    END IF;
    IF market <> 'unknown' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_active_on_duty_doctors()) x
      JOIN country_fixture f ON f.id::text=x->>'id' WHERE f.kind='doctor_'||market) THEN
      RAISE EXCEPTION 'Matching duty doctor hidden';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_active_on_duty_doctors()) x
      JOIN country_fixture f ON f.id::text=x->>'id' WHERE f.kind <> 'doctor_'||market) THEN
      RAISE EXCEPTION 'Duty RPC country leak';
    END IF;
  END LOOP;
  -- A treating doctor cannot choose an unknown patient's country on their behalf.
  SELECT uid INTO v_uid FROM country_fixture WHERE kind='doctor_ar';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_uid)::text,true);
  BEGIN
    UPDATE public.patients SET care_country='AR' WHERE user_id=(SELECT uid FROM country_fixture WHERE kind='patient_unknown');
    -- RLS may filter the row before the owner guard runs; either outcome is safe.
    IF FOUND THEN RAISE EXCEPTION 'Doctor chose another patient country'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM pg_temp.country_definer_attempt((SELECT id FROM country_fixture WHERE kind='patient_unknown'));
    RAISE EXCEPTION 'SECURITY DEFINER bypassed country selection ownership';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'care_country_selection_owner_required' THEN RAISE; END IF;
  END;
  SELECT uid INTO v_uid FROM country_fixture WHERE kind='patient_ar';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_uid)::text,true);
  BEGIN
    UPDATE public.patients SET care_country='BR' WHERE user_id=v_uid;
    RAISE EXCEPTION 'Patient switched country after initial selection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $patient_checks$;
RESET ROLE;

-- Service-role API writes cannot bypass pairing. Both mismatch directions and unknown.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $service_checks$
DECLARE p record; d record; v_market text; v_doc uuid;
BEGIN
  FOR p IN SELECT * FROM country_fixture WHERE kind LIKE 'patient%' LOOP
    FOR d IN SELECT * FROM country_fixture WHERE kind LIKE 'doctor%' LOOP
      IF p.kind='patient_ar' AND d.kind='doctor_ar' OR p.kind='patient_br' AND d.kind='doctor_br' THEN
        INSERT INTO public.appointments(patient_id,doctor_id,start_time,end_time,status,type)
        VALUES(p.id,d.id,now()+interval '20 days',now()+interval '20 days 30 minutes','scheduled','telemedicine');
        IF NOT EXISTS(SELECT 1 FROM public.get_doctor_busy_slots(d.id,current_date+20,current_date+20)) THEN
          RAISE EXCEPTION 'Trusted availability query lost booked slots';
        END IF;
        v_market := CASE p.kind WHEN 'patient_ar' THEN 'AR' ELSE 'BR' END;
        INSERT INTO public.prescriptions(patient_id,doctor_id,country_code,clinical_data,vendor_name,status)
        VALUES(p.id,d.id,v_market,'{}','internal','draft') RETURNING id INTO v_doc;
        BEGIN
          UPDATE public.prescriptions SET country_code=CASE v_market WHEN 'AR' THEN 'BR' ELSE 'AR' END WHERE id=v_doc;
          RAISE EXCEPTION 'Existing prescription country forged';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        INSERT INTO public.medical_certificates(patient_id,doctor_id,country_code,cuir,certificate_type,status)
        VALUES(p.id,d.id,v_market,'CI-'||gen_random_uuid(),'constancia_atencion','draft');
        INSERT INTO public.medical_orders(patient_id,doctor_id,study_type,practices,status)
        VALUES(p.id,d.id,'laboratory','[]','draft');
      ELSE
        BEGIN
          INSERT INTO public.appointments(patient_id,doctor_id,start_time,end_time,status,type)
          VALUES(p.id,d.id,now()+interval '21 days',now()+interval '21 days 30 minutes','scheduled','telemedicine');
          RAISE EXCEPTION 'Cross-country service appointment accepted: % -> %',p.kind,d.kind;
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO public.doctor_patient(patient_id,doctor_id) VALUES(p.id,d.id);
          RAISE EXCEPTION 'Cross-country legacy care relationship accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO public.patient_care_team(patient_id,doctor_id,active) VALUES(p.id,d.id,true);
          RAISE EXCEPTION 'Cross-country care team accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO public.prescriptions(patient_id,doctor_id,country_code) VALUES(p.id,d.id,'AR');
          RAISE EXCEPTION 'Cross-country prescription accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO public.medical_certificates(patient_id,doctor_id,country_code) VALUES(p.id,d.id,'AR');
          RAISE EXCEPTION 'Cross-country certificate accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO public.medical_records(patient_id,doctor_id,type,title,content)
          VALUES(p.id,d.id,'consultation','CI country rejection','{}');
          RAISE EXCEPTION 'Cross-country medical record accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
          INSERT INTO public.calls(patient_id,doctor_id,room_id,status)
          VALUES(p.id,d.id,'ci-country-'||gen_random_uuid(),'requested');
          RAISE EXCEPTION 'Cross-country service call accepted';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      END IF;
    END LOOP;
  END LOOP;
END $service_checks$;
-- With only AR doctors live, a BR request must remain queued without
-- an AR offer or cross-border notification. No-doctor is not an error.
UPDATE public.doctor_duty_status SET is_on_duty=false,last_heartbeat_at=now()-interval '1 day'
 WHERE doctor_id IN (SELECT id FROM public.doctors WHERE care_country='BR');
DO $no_candidate$
DECLARE v_request uuid; v_patient record; v_result jsonb;
BEGIN
  SELECT * INTO v_patient FROM country_fixture WHERE kind='patient_br';
  INSERT INTO public.pharmacy_dispatch_requests(patient_dni,patient_phone,patient_name,
    tier_requested,status,requested_by_user_id,care_country,cloudflare_room_id)
  VALUES('CI-'||v_patient.id,'0000000000','Synthetic CI patient','general','searching',v_patient.uid,'BR','ci-country-room-'||v_patient.id)
  RETURNING id INTO v_request;
  -- Gen2 may invoke matching explicitly rather than through the legacy trigger.
  SELECT public.match_dispatch_doctors(v_request) INTO v_result;
  IF NOT EXISTS(SELECT 1 FROM public.pharmacy_dispatch_requests WHERE id=v_request AND status='searching' AND search_timeout_at IS NULL)
     OR EXISTS(SELECT 1 FROM public.dispatch_offers WHERE dispatch_request_id=v_request) THEN
    RAISE EXCEPTION 'BR dispatch country/persistent-queue failure: result %, status %, offers %',
      v_result,(SELECT status FROM public.pharmacy_dispatch_requests WHERE id=v_request),
      (SELECT count(*) FROM public.dispatch_offers WHERE dispatch_request_id=v_request);
  END IF;
END $no_candidate$;
RESET ROLE;
-- Catalog checks ensure every clinical write path has the guard, including future APIs.
DO $contracts$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['appointments','calls','patient_care_team','doctor_patient','appointment_waitlist','care_episodes','medical_orders','prescriptions','medical_certificates'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||v_table)::regclass
      AND tgname='trg_country_pair' AND tgenabled='O') THEN
      RAISE EXCEPTION 'Missing country guard: %',v_table;
    END IF;
  END LOOP;
  IF app_private.credential_country('MN','123','RS') <> 'AR'
     OR app_private.credential_country('CRM','123','RS') <> 'BR'
     OR app_private.credential_country('CRM','123','XX') IS NOT NULL
     OR app_private.credential_country('CRO','123','RS') IS NOT NULL
     OR app_private.credential_country('MN','PENDING',NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Credential classifier confused country/type/UF';
  END IF;
END $contracts$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',
 (SELECT uid FROM country_fixture WHERE kind='patient_unknown'))::text,true);
UPDATE public.patients SET care_country='BR' WHERE id=(SELECT id FROM country_fixture WHERE kind='patient_unknown');
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_patient_doctor_directory()) d
    JOIN country_fixture f ON f.id::text=d->>'id' WHERE f.kind='doctor_br') THEN
    RAISE EXCEPTION 'Own initial country selection did not unlock matching directory';
  END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.doctors) THEN RAISE EXCEPTION 'Anonymous directory country bypass'; END IF;
END $$;
RESET ROLE;
ROLLBACK;

