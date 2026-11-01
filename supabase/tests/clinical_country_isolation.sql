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
 '123456',CASE kind WHEN 'doctor_br' THEN 'RS' ELSE NULL END,'CI country isolation',true
 FROM country_fixture WHERE kind LIKE 'doctor%'
 ON CONFLICT(user_id) DO UPDATE SET license_type=excluded.license_type,
 license_number=excluded.license_number,uf_brazil=excluded.uf_brazil,active=true;
UPDATE country_fixture f SET id=d.id FROM public.doctors d WHERE d.user_id=f.uid AND f.kind LIKE 'doctor%';
-- A secondary credential must never relabel the primary doctor's market.
INSERT INTO public.doctor_licenses(doctor_id,license_type,license_number,uf_brazil,status)
 SELECT id,'CRM','765432','SP','active' FROM country_fixture WHERE kind='doctor_ar';
INSERT INTO public.doctor_licenses(doctor_id,license_type,license_number,status)
 SELECT id,'MN','765432','active' FROM country_fixture WHERE kind='doctor_br';

SET LOCAL ROLE authenticated;
DO $patient_checks$
DECLARE market text; v_uid uuid; v_country text; v_id uuid;
BEGIN
  FOREACH market IN ARRAY ARRAY['ar','br','unknown'] LOOP
    SELECT uid INTO v_uid FROM country_fixture WHERE kind='patient_'||market;
    v_country := CASE market WHEN 'ar' THEN 'AR' WHEN 'br' THEN 'BR' END;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_uid)::text,true);
    IF EXISTS(SELECT 1 FROM public.doctors WHERE care_country IS DISTINCT FROM v_country) THEN
      RAISE EXCEPTION 'Directory leak for %',market;
    END IF;
    IF market='unknown' AND EXISTS(SELECT 1 FROM public.doctors) THEN
      RAISE EXCEPTION 'Unknown country directory did not fail closed';
    END IF;
    IF market <> 'unknown' AND NOT EXISTS(
      SELECT 1 FROM public.doctors d JOIN country_fixture f ON d.id=f.id WHERE f.kind='doctor_'||market
    ) THEN RAISE EXCEPTION 'Matching doctor hidden for %',market; END IF;
    IF EXISTS(SELECT 1 FROM public.doctor_licenses l
      WHERE (market='ar' AND l.license_type='CRM')
         OR (market='br' AND l.license_type IN ('MN','MP'))
         OR market='unknown') THEN RAISE EXCEPTION 'Credential country leak for %',market; END IF;
    IF EXISTS(SELECT 1 FROM public.profiles p JOIN country_fixture f ON p.user_id=f.uid
      WHERE f.kind LIKE 'doctor%' AND (market='unknown' OR f.kind <> 'doctor_'||market)) THEN
      RAISE EXCEPTION 'Doctor profile leak for %',market;
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_active_on_duty_doctors()) x
      JOIN country_fixture f ON f.id::text=x->>'id' WHERE f.kind <> 'doctor_'||market) THEN
      RAISE EXCEPTION 'Duty RPC country leak';
    END IF;
  END LOOP;
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
DECLARE p record; d record; v_market text;
BEGIN
  FOR p IN SELECT * FROM country_fixture WHERE kind LIKE 'patient%' LOOP
    FOR d IN SELECT * FROM country_fixture WHERE kind LIKE 'doctor%' LOOP
      IF p.kind='patient_ar' AND d.kind='doctor_ar' OR p.kind='patient_br' AND d.kind='doctor_br' THEN
        INSERT INTO public.appointments(patient_id,doctor_id,start_time,end_time,status,type)
        VALUES(p.id,d.id,now()+interval '20 days',now()+interval '20 days 30 minutes','scheduled','telemedicine');
      ELSE
        BEGIN
          INSERT INTO public.appointments(patient_id,doctor_id,start_time,end_time,status,type)
          VALUES(p.id,d.id,now()+interval '21 days',now()+interval '21 days 30 minutes','scheduled','telemedicine');
          RAISE EXCEPTION 'Cross-country service appointment accepted: % -> %',p.kind,d.kind;
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
RESET ROLE;
-- Catalog checks ensure every clinical write path has the guard, including future APIs.
DO $contracts$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['appointments','calls','patient_care_team','prescriptions','medical_certificates'] LOOP
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
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.doctors) THEN RAISE EXCEPTION 'Anonymous directory country bypass'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
