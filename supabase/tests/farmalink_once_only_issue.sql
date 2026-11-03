-- Local disposable Supabase only. No external requests and no production data.
BEGIN;

DO $privileges$
BEGIN
 IF has_function_privilege('anon', 'public.claim_farmalink_issue(uuid,text,uuid,jsonb)', 'EXECUTE')
 OR has_function_privilege('authenticated', 'public.claim_farmalink_issue(uuid,text,uuid,jsonb)', 'EXECUTE')
 OR has_function_privilege('anon', 'public.record_farmalink_issue(uuid,uuid,text,uuid,text,text)', 'EXECUTE')
 OR has_function_privilege('authenticated', 'public.record_farmalink_issue(uuid,uuid,text,uuid,text,text)', 'EXECUTE')
 THEN RAISE EXCEPTION 'Farmalink RPC must not be callable from browser roles'; END IF;
 IF NOT has_function_privilege('service_role', 'public.claim_farmalink_issue(uuid,text,uuid,jsonb)', 'EXECUTE')
 THEN RAISE EXCEPTION 'Farmalink claim must be executable by server role'; END IF;
 IF has_table_privilege('anon','public.farmalink_issue_attempts','SELECT')
 OR has_table_privilege('authenticated','public.farmalink_issue_attempts','INSERT')
 THEN RAISE EXCEPTION 'Farmalink private table exposed'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.farmalink_issue_attempts'::regclass)
 THEN RAISE EXCEPTION 'Farmalink RLS disabled'; END IF;
END
$privileges$;

CREATE TEMP TABLE farmalink_fixture(uid uuid, other_uid uuid, prescription_id uuid, PRIMARY KEY (prescription_id));
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
 INSERT INTO farmalink_fixture VALUES(actor_uid,stranger_uid,rx_id);
END
$fixtures$;

SET LOCAL ROLE service_role;

DO $atomic_claim$
DECLARE
 x farmalink_fixture%ROWTYPE;
 c1 jsonb;
 c2 jsonb;
 c3 jsonb;
 attempt uuid;
 invalid_claim boolean := false;
BEGIN
 SELECT * INTO x FROM farmalink_fixture LIMIT 1;
 c1 := public.claim_farmalink_issue(x.prescription_id, repeat('a',64),x.uid,'{}'::jsonb);
 IF c1->>'claimed' <> 'true' OR c1->>'state' <> 'reserved'
 THEN RAISE EXCEPTION 'First claim must reserve exactly once'; END IF;
 attempt := (c1->>'attempt_id')::uuid;

 c2 := public.claim_farmalink_issue(x.prescription_id, repeat('a',64),x.uid,'{}'::jsonb);
 IF c2->>'claimed' <> 'false' OR c2->>'attempt_id' <> attempt::text
 THEN RAISE EXCEPTION 'Duplicate claim must fail while preserving attempt identity'; END IF;

 BEGIN
   PERFORM public.claim_farmalink_issue(x.prescription_id, repeat('b',64),x.other_uid,'{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN invalid_claim := true;
 END;
 IF NOT invalid_claim THEN RAISE EXCEPTION 'Another doctor may not claim the prescription'; END IF;

 IF NOT public.record_farmalink_issue(x.prescription_id,attempt,'unknown',x.uid)
 THEN RAISE EXCEPTION 'Reserved attempt must enter unknown on timeout'; END IF;
 IF public.record_farmalink_issue(x.prescription_id,attempt,'confirmed',x.uid,'12345678','00')
 THEN RAISE EXCEPTION 'Unknown attempts cannot be upgraded without reconciliation'; END IF;

 c3 := public.claim_farmalink_issue(x.prescription_id, repeat('b',64),x.uid,'{}'::jsonb);
 IF c3->>'claimed' <> 'false' OR c3->>'state' <> 'unknown'
 THEN RAISE EXCEPTION 'Ambiguous outcome must permanently block automatic alta'; END IF;
END
$atomic_claim$;

RESET ROLE;
ROLLBACK;

