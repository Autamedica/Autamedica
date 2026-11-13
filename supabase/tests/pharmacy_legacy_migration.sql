-- Run only through scripts/db/test-pharmacy-legacy-migration.sh against a reset
-- local database immediately before the consolidated 2026-11-13 country migrations.
BEGIN;
SET LOCAL autamedica.isolated_test='on';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='dispensation_orders' AND column_name='care_country') THEN
    RAISE EXCEPTION 'legacy_fixture_must_precede_pharmacy_country_migration';
  END IF;
  IF EXISTS(SELECT 1 FROM public.dispensation_orders) OR EXISTS(SELECT 1 FROM public.pharmacies)
    OR EXISTS(SELECT 1 FROM public.pharmacists) OR EXISTS(SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'legacy_fixture_requires_empty_disposable_database';
  END IF;
END $$;
CREATE SCHEMA pharmacy_legacy_ci;
CREATE TABLE pharmacy_legacy_ci.fixture(key text PRIMARY KEY,value uuid NOT NULL);
INSERT INTO pharmacy_legacy_ci.fixture SELECT key,gen_random_uuid() FROM unnest(ARRAY[
  'doctor_user','patient_user','pharmacist_user','doctor','patient','pharmacy_a','pharmacy_b',
  'pharmacist_a','pharmacist_b','rx','order_dispensed','order_pending']) key;
CREATE FUNCTION pharmacy_legacy_ci.id(p_key text) RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT value FROM pharmacy_legacy_ci.fixture WHERE key=p_key $$;
CREATE TABLE pharmacy_legacy_ci.snapshot(table_name text,id uuid,contents jsonb,PRIMARY KEY(table_name,id));
GRANT USAGE ON SCHEMA pharmacy_legacy_ci TO authenticated,service_role;
GRANT SELECT ON pharmacy_legacy_ci.fixture TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION pharmacy_legacy_ci.id(text) TO authenticated,service_role;
INSERT INTO auth.users(id,email)
SELECT value,'isolated-legacy-'||key||'-'||value||'@example.invalid'
FROM pharmacy_legacy_ci.fixture WHERE key IN('doctor_user','patient_user','pharmacist_user');
UPDATE public.profiles SET role='doctor',active=true WHERE user_id=pharmacy_legacy_ci.id('doctor_user');
INSERT INTO public.doctors(id,user_id,license_type,license_number,specialty,active)
VALUES(pharmacy_legacy_ci.id('doctor'),pharmacy_legacy_ci.id('doctor_user'),'MN','CI-LEGACY-NOT-REAL','Synthetic legacy',true)
ON CONFLICT(user_id) DO UPDATE SET license_type='MN',license_number='CI-LEGACY-NOT-REAL',active=true;
UPDATE pharmacy_legacy_ci.fixture SET value=(SELECT id FROM public.doctors WHERE user_id=pharmacy_legacy_ci.id('doctor_user')) WHERE key='doctor';
UPDATE public.patients SET care_country='AR',active=true WHERE user_id=pharmacy_legacy_ci.id('patient_user');
UPDATE pharmacy_legacy_ci.fixture SET value=(SELECT id FROM public.patients WHERE user_id=pharmacy_legacy_ci.id('patient_user')) WHERE key='patient';
INSERT INTO public.pharmacies(id,name,license_number)
SELECT pharmacy_legacy_ci.id('pharmacy_'||kind),'Synthetic pre-migration pharmacy '||kind,'CI-LEGACY-'||kind FROM unnest(ARRAY['a','b']) kind;
INSERT INTO public.pharmacists(id,user_id,pharmacy_id,license_number,role,active)
SELECT pharmacy_legacy_ci.id('pharmacist_'||kind),pharmacy_legacy_ci.id('pharmacist_user'),
  pharmacy_legacy_ci.id('pharmacy_'||kind),'CI-LEGACY-NO-REAL-CRF','pharmacist',true FROM unnest(ARRAY['a','b']) kind;
INSERT INTO public.prescriptions(id,patient_id,doctor_id,country_code,clinical_data,vendor_name,status,signed_pdf_url)
VALUES(pharmacy_legacy_ci.id('rx'),pharmacy_legacy_ci.id('patient'),pharmacy_legacy_ci.id('doctor'),'AR',
  '{"legacy_document":"synthetic-preserve-exactly","items":[{"quantity":7}]}'::jsonb,
  'isolated-legacy-no-real-provider','dispensed_total','synthetic://unchanged-legacy.pdf');
-- Duplicate historical Rx orders are preserved. The partial operative index must
-- not convert a reconciliation finding into an installation failure or a rewrite.
INSERT INTO public.dispensation_orders(id,prescription_id,patient_id,doctor_id,pharmacy_id,medication,formulation,
  quantity_units,duration_days,dispense_window_start,dispense_window_end,status,prescriber_verified,reconciliation_status,clinician_decision)
SELECT pharmacy_legacy_ci.id('order_'||kind),pharmacy_legacy_ci.id('rx'),pharmacy_legacy_ci.id('patient'),
  pharmacy_legacy_ci.id('doctor'),pharmacy_legacy_ci.id('pharmacy_a'),'Synthetic legacy medicine','tablet',7,30,
  current_date-10,current_date+20,CASE WHEN kind='dispensed' THEN 'dispensed' ELSE 'pending' END,true,'reconciled','approved'
FROM unnest(ARRAY['dispensed','pending']) kind;
INSERT INTO public.dispensation_events(order_id,pharmacist_id,pharmacy_id,dispense_status,
  dispensed_medication,dispensed_formulation,dispensed_quantity)
SELECT pharmacy_legacy_ci.id('order_dispensed'),pharmacy_legacy_ci.id('pharmacist_a'),pharmacy_legacy_ci.id('pharmacy_a'),
  'dispensed','Synthetic legacy medicine','tablet',1 FROM generate_series(1,7);
-- Duplicate pending historical requests must remain unchanged and quarantined.
INSERT INTO public.dispensation_clarifications(order_id,requested_by,question,question_category)
SELECT pharmacy_legacy_ci.id('order_pending'),pharmacy_legacy_ci.id('pharmacist_user'),'Synthetic historical question','other'
FROM generate_series(1,2);
DO $snapshot$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pharmacies','pharmacists','dispensation_orders','dispensation_events','dispensation_clarifications','prescriptions'] LOOP
    EXECUTE format('INSERT INTO pharmacy_legacy_ci.snapshot SELECT %L,id,to_jsonb(t) FROM public.%I t',v_table,v_table);
  END LOOP;
END $snapshot$;

\ir ../migrations/20261113010000_pharmacy_country_isolation_p0.sql
\ir ../migrations/20261113020000_pharmacy_legacy_country_quarantine.sql

DO $preserve$
DECLARE v_table text; v_changed boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pharmacies','pharmacists','dispensation_orders','dispensation_events','dispensation_clarifications','prescriptions'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM pharmacy_legacy_ci.snapshot s FULL JOIN public.%I t ON t.id=s.id AND s.table_name=%L WHERE (s.table_name=%L OR s.table_name IS NULL) AND (s.id IS NULL OR t.id IS NULL OR (to_jsonb(t)-''care_country'') IS DISTINCT FROM s.contents))',v_table,v_table,v_table) INTO v_changed;
    IF v_changed THEN RAISE EXCEPTION 'Historical source data changed during migration: %',v_table; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.pharmacies WHERE care_country IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.pharmacists WHERE care_country IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.dispensation_orders WHERE care_country IS NOT NULL)
    OR (SELECT count(*) FROM public.dispensation_events)<>7 THEN
    RAISE EXCEPTION 'Legacy country was inferred or delivery history changed';
  END IF;
END $preserve$;

-- RLS must quarantine even the original physician/patient/operator, not merely
-- hide the rows from unrelated pharmacies. Privileged reconciliation can read.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_legacy_ci.id('doctor_user'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.dispensation_orders) OR EXISTS(SELECT 1 FROM public.dispensation_events)
    OR EXISTS(SELECT 1 FROM public.dispensation_clarifications) THEN
    RAISE EXCEPTION 'Original physician could use legacy pharmacy rows through RLS';
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_legacy_ci.id('patient_user'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.dispensation_orders) THEN RAISE EXCEPTION 'Original patient could read quarantined order'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_legacy_ci.id('pharmacist_user'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.pharmacists) OR EXISTS(SELECT 1 FROM public.pharmacies)
     OR EXISTS(SELECT 1 FROM public.dispensation_orders) OR EXISTS(SELECT 1 FROM public.dispensation_events) THEN
    RAISE EXCEPTION 'Legacy pharmacist retained access through helper/RLS';
  END IF;
END $$;
RESET ROLE;

-- Bypass-RLS clients must still fail to reactivate/reclassify/delete history.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $privileged_denials$
DECLARE v_denied boolean;
BEGIN
  v_denied:=false;
  BEGIN UPDATE public.dispensation_orders SET status='assigned' WHERE id=pharmacy_legacy_ci.id('order_pending');
  EXCEPTION WHEN check_violation THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Privileged client reactivated legacy order'; END IF;
  v_denied:=false;
  BEGIN UPDATE public.dispensation_orders SET care_country='AR' WHERE id=pharmacy_legacy_ci.id('order_pending');
  EXCEPTION WHEN check_violation THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Privileged client reclassified legacy order'; END IF;
  v_denied:=false;
  BEGIN UPDATE public.pharmacies SET care_country='AR' WHERE id=pharmacy_legacy_ci.id('pharmacy_a');
  EXCEPTION WHEN check_violation THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Privileged client reclassified legacy pharmacy'; END IF;
  v_denied:=false;
  BEGIN DELETE FROM public.dispensation_orders WHERE id=pharmacy_legacy_ci.id('order_pending');
  EXCEPTION WHEN check_violation THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Privileged client deleted legacy order'; END IF;
END $privileged_denials$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_legacy_ci.id('doctor_user'),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $no_replacement$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.dispensation_orders(prescription_id,patient_id,doctor_id,medication,formulation,
      quantity_units,duration_days,dispense_window_start,dispense_window_end)
    VALUES(pharmacy_legacy_ci.id('rx'),pharmacy_legacy_ci.id('patient'),pharmacy_legacy_ci.id('doctor'),
      'Synthetic legacy medicine','tablet',7,30,current_date,current_date+30);
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM<>'dispensation_legacy_prescription_requires_reconciliation' THEN RAISE; END IF;
    v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'A new operative order bypassed legacy Rx reconciliation'; END IF;
END $no_replacement$;
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'Legacy migration fixture preservation and quarantine passed'; END $$;
ROLLBACK;
