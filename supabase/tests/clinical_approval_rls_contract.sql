-- Disposable migration-replay regression. Creates only a synthetic Auth user
-- and rolls every write back. Never run this fixture against production.
BEGIN;

DO $contracts$
DECLARE
  v_policy record;
  v_expr text;
  v_expected_gate text;
  v_patient_fk text;
  v_tables text[] := ARRAY[
    'appointment_followups','appointment_history','appointment_reminders',
    'appointment_waitlist','appointments','calls','care_episodes',
    'clinical_case_states','consultation_transcripts','conversation_sessions',
    'dispatch_offers','dispensation_clarifications','dispensation_events',
    'dispensation_orders','dispensation_validations','lab_results',
    'medication_logs','medical_certificates','medical_chats','medical_messages',
    'medical_orders','medical_records','patient_alerts','patient_care_team',
    'patients','pharmacy_audit_events','pharmacy_consultation_requests',
    'pharmacy_dispatch_requests','prescription_audit_events','prescriptions',
    'symptom_reports','telemedicine_sessions','vital_signs'
  ];
BEGIN
  IF to_regprocedure('public.is_clinically_approved_doctor()') IS NULL THEN
    RAISE EXCEPTION 'Clinical approval predicate is missing';
  END IF;

  IF position('is_clinically_approved_doctor' IN
      pg_get_functiondef('public.doctor_has_patient_access(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'doctor_has_patient_access does not require clinical approval';
  END IF;

  IF position('is_doctor_dispatch_approved' IN
      pg_get_functiondef('public.can_self_assign_care_team(uuid,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Care-team self-assignment bypasses official approval';
  END IF;

  FOR v_policy IN
    SELECT c.relname, p.polname, p.polcmd,
           pg_get_expr(p.polqual,p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY(v_tables)
  LOOP
    v_expr := concat_ws(' ',v_policy.using_expr,v_policy.check_expr);
    IF v_policy.polcmd='r' THEN
      v_patient_fk := NULL;
      SELECT ccu.table_name INTO v_patient_fk
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name AND tc.constraint_schema=ccu.constraint_schema
      WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
        AND tc.table_name=v_policy.relname AND kcu.column_name='patient_id' LIMIT 1;
      IF v_policy.relname='patients' OR v_patient_fk IN ('patients','profiles') THEN
        v_expected_gate := CASE WHEN v_patient_fk='profiles' THEN 'doctor_has_patient_read_access(' ELSE 'is_clinically_authorized_doctor_read_for_patient(' END;
      ELSE
        v_expected_gate := 'is_clinically_authorized_doctor_read()';
      END IF;
    ELSE
      v_expected_gate := 'is_clinically_approved_doctor()';
    END IF;

    IF v_expr ~* '(^|[^a-z_])is_doctor\(\)' THEN
      RAISE EXCEPTION 'Legacy is_doctor() still authorizes %.%',v_policy.relname,v_policy.polname;
    END IF;

    IF v_expr ~* '(d|doctors)\.user_id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\))'
       AND position(v_expected_gate IN v_expr)=0 THEN
      RAISE EXCEPTION 'Direct doctor identity branch lacks approval: %.%',v_policy.relname,v_policy.polname;
    END IF;

    IF v_expr ~* 'doctor_id = get_my_doctor_id\(\)'
       AND position(v_expected_gate IN v_expr)=0 THEN
      RAISE EXCEPTION 'get_my_doctor_id branch lacks approval: %.%',v_policy.relname,v_policy.polname;
    END IF;

    IF v_expr ~* 'doctor_id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\))'
       AND position(v_expected_gate IN v_expr)=0 THEN
      RAISE EXCEPTION 'Direct doctor_id branch lacks approval: %.%',v_policy.relname,v_policy.polname;
    END IF;
  END LOOP;

  IF to_regprocedure('public.is_clinically_authorized_doctor_read()') IS NULL
     OR to_regprocedure('public.doctor_has_patient_read_access(uuid)') IS NULL
     OR to_regprocedure('public.is_clinically_authorized_doctor_read_for_patient(uuid)') IS NULL
     OR to_regclass('app_private.clinical_legacy_read_grants') IS NULL THEN
    RAISE EXCEPTION 'Read-only legacy bridge is incomplete';
  END IF;
  IF has_table_privilege('anon','app_private.clinical_legacy_read_grants','SELECT')
     OR has_table_privilege('authenticated','app_private.clinical_legacy_read_grants','SELECT')
     OR has_table_privilege('service_role','app_private.clinical_legacy_read_grants','SELECT') THEN
    RAISE EXCEPTION 'Legacy grant table is exposed directly';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND polcmd<>'r'
    AND concat_ws(' ',qual,with_check) ILIKE '%doctor_has_patient_read_access(%') THEN
    RAISE EXCEPTION 'Read-only helper leaked into write policy';
  END IF;
  -- Patient ownership must remain present in the shared patient/doctor policy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='medical_records'
      AND policyname='medical_records_select_scoped'
      AND qual LIKE '%patients.user_id%'
  ) THEN
    RAISE EXCEPTION 'Patient-owned medical-record access was removed';
  END IF;
END;
$contracts$;

-- Reproduce a legacy active + PENDING doctor using a synthetic Auth identity.
INSERT INTO auth.users (
  id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data
) VALUES (
  'a1100000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated',
  'synthetic-clinical-pending@example.invalid',
  '{"role":"doctor","first_name":"Synthetic","last_name":"Pending"}'::jsonb,
  '{}'::jsonb
);

INSERT INTO public.doctors(user_id,license_number,specialty,active,care_country)
SELECT 'a1100000-0000-4000-8000-000000000001','PENDING-LEGACY','General Medicine',true,'BR'
WHERE NOT EXISTS(SELECT 1 FROM public.doctors WHERE user_id='a1100000-0000-4000-8000-000000000001');
UPDATE public.doctors SET active=true,license_number='PENDING-LEGACY',care_country='BR'
WHERE user_id='a1100000-0000-4000-8000-000000000001';
INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
VALUES('a1100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
'synthetic-legacy-patient@example.invalid','{"role":"patient"}'::jsonb,'{}'::jsonb);
INSERT INTO public.patients(user_id,active) VALUES('a1100000-0000-4000-8000-000000000002',true);
INSERT INTO public.patients(user_id,active) SELECT 'a1100000-0000-4000-8000-000000000001',true WHERE NOT EXISTS(SELECT 1 FROM public.patients WHERE user_id='a1100000-0000-4000-8000-000000000001');
INSERT INTO auth.users(id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
VALUES('a1100000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
'synthetic-unassigned-patient@example.invalid','{"role":"patient"}'::jsonb,'{}'::jsonb);
INSERT INTO public.patients(user_id,active) VALUES('a1100000-0000-4000-8000-000000000003',true);
DO $legacy_grant$
DECLARE v_doctor_id uuid;v_patient_id uuid;
BEGIN
 SELECT id INTO v_doctor_id FROM public.doctors WHERE user_id='a1100000-0000-4000-8000-000000000001';
 SELECT id INTO v_patient_id FROM public.patients WHERE user_id='a1100000-0000-4000-8000-000000000002';
 INSERT INTO public.patient_care_team(doctor_id,patient_id,active) VALUES(v_doctor_id,v_patient_id,true);
 INSERT INTO public.appointments(doctor_id,patient_id,start_time,status) VALUES(v_doctor_id,v_patient_id,now()-interval '1 day','completed');
 INSERT INTO app_private.clinical_legacy_read_grants(doctor_id,patient_id,source,expires_at) VALUES(v_doctor_id,v_patient_id,'patient_care_team',now()+interval '30 days');
 INSERT INTO public.appointments(doctor_id,patient_id,start_time,status) VALUES(v_doctor_id,(SELECT id FROM public.patients WHERE user_id='a1100000-0000-4000-8000-000000000001'),now()+interval '2 days','scheduled');
END;
$legacy_grant$;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1100000-0000-4000-8000-000000000001"}',
  true
);
SELECT set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;

DO $pending$
DECLARE v_patient_id uuid;v_patient_user_id uuid:='a1100000-0000-4000-8000-000000000002';v_count integer;
BEGIN
 SELECT id INTO v_patient_id FROM public.patients WHERE user_id=v_patient_user_id;
 IF public.is_clinically_approved_doctor() THEN RAISE EXCEPTION 'PENDING doctor passed approval'; END IF;
 IF NOT public.is_clinically_authorized_doctor_read() THEN RAISE EXCEPTION 'Legacy read bridge missing'; END IF;
 IF public.doctor_has_patient_access(v_patient_user_id) THEN RAISE EXCEPTION 'Legacy write access retained'; END IF;
 IF NOT public.doctor_has_patient_read_access(v_patient_user_id) THEN RAISE EXCEPTION 'Patient-specific read bridge missing'; END IF;
 IF public.doctor_has_patient_read_access('a1100000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Unassigned patient read access leaked'; END IF;
 IF public.is_clinically_authorized_doctor_read_for_patient((SELECT id FROM public.patients WHERE user_id='a1100000-0000-4000-8000-000000000001')) THEN
   RAISE EXCEPTION 'Unassigned dual-role doctor patient row received a legacy grant';
 END IF;
 BEGIN
   UPDATE public.appointments SET status='completed'
   WHERE doctor_id=public.get_my_doctor_id()
     AND patient_id=(SELECT id FROM public.patients WHERE user_id='a1100000-0000-4000-8000-000000000001');
   IF FOUND THEN RAISE EXCEPTION 'Unapproved dual-role doctor bypassed approval via patient branch'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SELECT count(*) INTO v_count FROM public.appointments WHERE doctor_id=public.get_my_doctor_id() AND patient_id=v_patient_id;
 IF v_count<>1 THEN RAISE EXCEPTION 'Existing appointment unreadable'; END IF;
 BEGIN
  INSERT INTO public.appointments(doctor_id,patient_id,start_time,status) VALUES(public.get_my_doctor_id(),v_patient_id,now()+interval '1 day','scheduled');
  RAISE EXCEPTION 'Legacy doctor created a new appointment';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$pending$;
RESET ROLE;
UPDATE app_private.clinical_legacy_read_grants SET expires_at=now()-interval '1 second'
WHERE doctor_id=(SELECT id FROM public.doctors WHERE user_id='a1100000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $expired$
BEGIN
 IF public.is_clinically_authorized_doctor_read() THEN RAISE EXCEPTION 'Expired grant remains active'; END IF;
END;
$expired$;
RESET ROLE;
ROLLBACK;
