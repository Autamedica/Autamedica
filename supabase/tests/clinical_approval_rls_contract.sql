-- Disposable migration-replay regression. Creates only a synthetic Auth user
-- and rolls every write back. Never run this fixture against production.
BEGIN;

DO $contracts$
DECLARE
  v_policy record;
  v_expr text;
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
    SELECT c.relname, p.polname,
           pg_get_expr(p.polqual,p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY(v_tables)
  LOOP
    v_expr := concat_ws(' ',v_policy.using_expr,v_policy.check_expr);

    IF v_expr ~* '(^|[^a-z_])is_doctor\(\)' THEN
      RAISE EXCEPTION 'Legacy is_doctor() still authorizes %.%',v_policy.relname,v_policy.polname;
    END IF;

    IF v_expr ~* '(d|doctors)\.user_id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\))'
       AND position('is_clinically_approved_doctor()' IN v_expr)=0 THEN
      RAISE EXCEPTION 'Direct doctor identity branch lacks approval: %.%',v_policy.relname,v_policy.polname;
    END IF;

    IF v_expr ~* 'doctor_id = get_my_doctor_id\(\)'
       AND position('is_clinically_approved_doctor()' IN v_expr)=0 THEN
      RAISE EXCEPTION 'get_my_doctor_id branch lacks approval: %.%',v_policy.relname,v_policy.polname;
    END IF;

    IF v_expr ~* 'doctor_id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\))'
       AND position('is_clinically_approved_doctor()' IN v_expr)=0 THEN
      RAISE EXCEPTION 'Direct doctor_id branch lacks approval: %.%',v_policy.relname,v_policy.polname;
    END IF;
  END LOOP;

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

UPDATE public.doctors
SET active=true, license_number='PENDING-LEGACY'
WHERE user_id='a1100000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"a1100000-0000-4000-8000-000000000001"}',
  true
);
SELECT set_config('request.jwt.claim.sub','a1100000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;

DO $pending$
BEGIN
  IF public.is_clinically_approved_doctor() THEN
    RAISE EXCEPTION 'Active PENDING synthetic doctor passed clinical approval';
  END IF;
END;
$pending$;

RESET ROLE;
ROLLBACK;
