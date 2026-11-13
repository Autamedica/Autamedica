-- Committed fixtures ONLY for independent-session concurrency testing on CI's
-- disposable local Supabase. The runner resets that local DB in its EXIT trap.
DO $$ BEGIN
  IF current_setting('autamedica.isolated_test',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'isolated_test_required';
  END IF;
  IF EXISTS(SELECT 1 FROM public.dispensation_orders) OR EXISTS(SELECT 1 FROM public.pharmacists)
    OR EXISTS(SELECT 1 FROM public.prescriptions) THEN
    RAISE EXCEPTION 'concurrency_fixtures_require_empty_disposable_clinical_database';
  END IF;
END $$;
CREATE SCHEMA pharmacy_ci_concurrency;
CREATE TABLE pharmacy_ci_concurrency.fixture(key text PRIMARY KEY,value uuid NOT NULL);
INSERT INTO pharmacy_ci_concurrency.fixture
SELECT key,gen_random_uuid() FROM unnest(ARRAY['user_d','user_p','user_a','user_b','doctor','patient',
  'pharmacy_a','pharmacy_b','pharmacist_a','pharmacist_b','rx_claim','rx_duplicate',
  'order_claim','order_duplicate','event_duplicate']) key;
CREATE FUNCTION pharmacy_ci_concurrency.id(p_key text) RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT value FROM pharmacy_ci_concurrency.fixture WHERE key=p_key $$;
CREATE TABLE pharmacy_ci_concurrency.results(kind text,worker text,outcome text,
  PRIMARY KEY(kind,worker));
GRANT USAGE ON SCHEMA pharmacy_ci_concurrency TO authenticated;
GRANT SELECT ON pharmacy_ci_concurrency.fixture TO authenticated;
GRANT EXECUTE ON FUNCTION pharmacy_ci_concurrency.id(text) TO authenticated;
GRANT SELECT,INSERT ON pharmacy_ci_concurrency.results TO authenticated;

INSERT INTO auth.users(id,email)
SELECT value,'isolated-pharmacy-'||key||'-'||value||'@example.invalid'
FROM pharmacy_ci_concurrency.fixture WHERE key LIKE 'user_%';
UPDATE public.profiles SET role='doctor',active=true WHERE user_id=pharmacy_ci_concurrency.id('user_d');
UPDATE public.profiles SET role='pharmacist',active=true
WHERE user_id IN(pharmacy_ci_concurrency.id('user_a'),pharmacy_ci_concurrency.id('user_b'));
INSERT INTO public.doctors(id,user_id,license_number,license_type,specialty,active)
VALUES(pharmacy_ci_concurrency.id('doctor'),pharmacy_ci_concurrency.id('user_d'),'CI-SYNTHETIC-NO-LICENSE','MN','Synthetic',true)
ON CONFLICT(user_id) DO UPDATE SET license_type='MN',license_number='CI-SYNTHETIC-NO-LICENSE',active=true;
UPDATE pharmacy_ci_concurrency.fixture SET value=(SELECT id FROM public.doctors
WHERE user_id=pharmacy_ci_concurrency.id('user_d')) WHERE key='doctor';
UPDATE public.patients SET care_country='AR',active=true WHERE user_id=pharmacy_ci_concurrency.id('user_p');
UPDATE pharmacy_ci_concurrency.fixture SET value=(SELECT id FROM public.patients
WHERE user_id=pharmacy_ci_concurrency.id('user_p')) WHERE key='patient';
INSERT INTO public.pharmacies(id,name,license_number,care_country)
SELECT pharmacy_ci_concurrency.id('pharmacy_'||kind),'Synthetic pharmacy '||kind,'CI-NO-REAL-REGISTRATION-'||kind,'AR'
FROM unnest(ARRAY['a','b']) kind;
INSERT INTO public.pharmacists(id,user_id,pharmacy_id,license_number,role,active)
SELECT pharmacy_ci_concurrency.id('pharmacist_'||kind),pharmacy_ci_concurrency.id('user_'||kind),
 pharmacy_ci_concurrency.id('pharmacy_'||kind),'CI-SYNTHETIC-NO-REAL-CRF','pharmacist',true
FROM unnest(ARRAY['a','b']) kind;
INSERT INTO public.prescriptions(id,patient_id,doctor_id,country_code,clinical_data,vendor_name,status)
SELECT pharmacy_ci_concurrency.id('rx_'||kind),pharmacy_ci_concurrency.id('patient'),pharmacy_ci_concurrency.id('doctor'),
 'AR','{}'::jsonb,'isolated-ci-no-real-provider','draft' FROM unnest(ARRAY['claim','duplicate']) kind;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pharmacy_ci_concurrency.id('user_d'),'role','authenticated')::text,false);
SET ROLE authenticated;
INSERT INTO public.dispensation_orders(id,prescription_id,patient_id,doctor_id,medication,formulation,
 quantity_units,duration_days,dispense_window_start,dispense_window_end)
SELECT pharmacy_ci_concurrency.id('order_'||kind),pharmacy_ci_concurrency.id('rx_'||kind),
 pharmacy_ci_concurrency.id('patient'),pharmacy_ci_concurrency.id('doctor'),'Synthetic','tablet',1,30,current_date,current_date+30
FROM unnest(ARRAY['claim','duplicate']) kind;
RESET ROLE;
