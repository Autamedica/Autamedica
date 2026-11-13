-- Enforce the single administrator-backed clinical eligibility predicate at
-- every authenticated clinical RLS boundary. Patient access is kept separate.
-- Existing doctor, appointment and patient rows are never rewritten here.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_clinically_approved_doctor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.user_id = (SELECT auth.uid())
      AND app_private.is_doctor_dispatch_approved(d.id)
  );
$function$;

REVOKE ALL ON FUNCTION public.is_clinically_approved_doctor()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_clinically_approved_doctor()
  TO anon, authenticated, service_role;

-- Temporary read-only bridge for pre-existing patient relationships.
CREATE TABLE IF NOT EXISTS app_private.clinical_legacy_read_grants (
 doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
 patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
 source text NOT NULL CHECK(source IN ('patient_care_team','doctor_patient','appointment')),
 granted_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(doctor_id,patient_id)
);
CREATE INDEX IF NOT EXISTS clinical_legacy_read_grants_expiry_idx ON app_private.clinical_legacy_read_grants(doctor_id,expires_at);
ALTER TABLE app_private.clinical_legacy_read_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.clinical_legacy_read_grants FROM PUBLIC,anon,authenticated,service_role;
WITH links AS (
 SELECT pct.doctor_id,pct.patient_id,'patient_care_team'::text source FROM public.patient_care_team pct
 JOIN public.patients p ON p.id=pct.patient_id AND p.active IS TRUE WHERE pct.active IS TRUE AND pct.doctor_id IS NOT NULL
 UNION ALL SELECT dp.doctor_id,dp.patient_id,'doctor_patient'::text FROM public.doctor_patient dp
 JOIN public.patients p ON p.id=dp.patient_id AND p.active IS TRUE WHERE dp.doctor_id IS NOT NULL
 UNION ALL SELECT a.doctor_id,a.patient_id,'appointment'::text FROM public.appointments a
 JOIN public.patients p ON p.id=a.patient_id AND p.active IS TRUE
 WHERE a.doctor_id IS NOT NULL AND a.patient_id IS NOT NULL AND a.deleted_at IS NULL
), eligible AS (
 SELECT l.doctor_id,l.patient_id,(array_agg(l.source ORDER BY l.source))[1] source
 FROM links l JOIN public.doctors d ON d.id=l.doctor_id
 WHERE d.active IS TRUE AND NOT app_private.is_doctor_dispatch_approved(d.id)
 GROUP BY l.doctor_id,l.patient_id
)
INSERT INTO app_private.clinical_legacy_read_grants(doctor_id,patient_id,source,expires_at)
SELECT doctor_id,patient_id,source,now()+interval '30 days' FROM eligible
ON CONFLICT(doctor_id,patient_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_clinically_authorized_doctor_read()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT public.is_clinically_approved_doctor() OR EXISTS(
  SELECT 1 FROM public.doctors d JOIN app_private.clinical_legacy_read_grants g ON g.doctor_id=d.id
  WHERE d.user_id=(SELECT auth.uid()) AND d.active IS TRUE AND g.expires_at>now()
 );
$function$;
REVOKE ALL ON FUNCTION public.is_clinically_authorized_doctor_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_clinically_authorized_doctor_read() TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.doctor_has_patient_read_access(patient_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT public.doctor_has_patient_access(patient_user_id) OR EXISTS(
  SELECT 1 FROM public.doctors d JOIN app_private.clinical_legacy_read_grants g ON g.doctor_id=d.id
  JOIN public.patients p ON p.id=g.patient_id
  WHERE d.user_id=(SELECT auth.uid()) AND d.active IS TRUE AND p.user_id=patient_user_id AND g.expires_at>now()
 );
$function$;
REVOKE ALL ON FUNCTION public.doctor_has_patient_read_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_has_patient_read_access(uuid) TO anon,authenticated,service_role;

-- Patient-id variant avoids querying public.patients from the patients RLS policy itself.
CREATE OR REPLACE FUNCTION public.is_clinically_authorized_doctor_read_for_patient(p_patient_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT public.is_clinically_approved_doctor() OR EXISTS(
  SELECT 1 FROM public.doctors d JOIN app_private.clinical_legacy_read_grants g ON g.doctor_id=d.id
  WHERE d.user_id=(SELECT auth.uid()) AND d.active IS TRUE
    AND g.patient_id=p_patient_id AND g.expires_at>now()
 );
$function$;
REVOKE ALL ON FUNCTION public.is_clinically_authorized_doctor_read_for_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_clinically_authorized_doctor_read_for_patient(uuid) TO anon,authenticated,service_role;
-- doctor_has_patient_access is itself a clinical authorization helper. Do not
-- let its SECURITY DEFINER context turn a technical doctor row into clearance.
CREATE OR REPLACE FUNCTION public.doctor_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_id uuid;
  v_patient_id uuid;
BEGIN
  IF NOT public.is_clinically_approved_doctor() THEN
    RETURN false;
  END IF;

  SELECT id INTO v_doctor_id
  FROM public.doctors
  WHERE user_id = auth.uid()
    AND active IS TRUE
  LIMIT 1;

  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE user_id = patient_user_id
    AND active IS TRUE
  LIMIT 1;

  IF v_doctor_id IS NULL OR v_patient_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.patient_care_team
    WHERE doctor_id = v_doctor_id AND patient_id = v_patient_id AND active IS TRUE
    UNION ALL
    SELECT 1 FROM public.doctor_patient
    WHERE doctor_id = v_doctor_id AND patient_id = v_patient_id
    UNION ALL
    SELECT 1 FROM public.appointments
    WHERE doctor_id = v_doctor_id
      AND patient_id = v_patient_id
      AND deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM public.pharmacy_dispatch_requests
    WHERE (assigned_doctor_id = v_doctor_id OR previous_doctor_id = v_doctor_id)
      AND (
        requested_by_user_id = patient_user_id
        OR requested_by_user_id = (SELECT user_id FROM public.patients WHERE id = v_patient_id)
        OR (
          patient_dni IS NOT NULL
          AND patient_dni = (SELECT dni FROM public.patients WHERE id = v_patient_id)
        )
      )
  );
END;
$function$;

-- Care-team self-assignment must use the same official approval predicate,
-- while retaining the existing requirement for a real clinical appointment.
CREATE OR REPLACE FUNCTION public.can_self_assign_care_team(
  p_doctor_id uuid,
  p_patient_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND app_private.is_doctor_dispatch_approved(p_doctor_id)
    AND EXISTS (
      SELECT 1
      FROM public.doctors d
      JOIN public.appointments a
        ON a.doctor_id = d.id
       AND a.patient_id = p_patient_id
       AND a.deleted_at IS NULL
       AND a.status::text IN ('scheduled', 'confirmed', 'in_progress', 'completed')
      WHERE d.id = p_doctor_id
        AND d.user_id = (SELECT auth.uid())
    );
$function$;

-- Several legacy policies authorize doctors through direct doctor/profile
-- joins rather than public.is_doctor(). Rewrite only the doctor branch of
-- clinical policies; patient and service_role branches remain unchanged.
DO $policies$
DECLARE
  v_policy record;
  v_using text;
  v_check text;
  v_new_using text;
  v_new_check text;
  v_doctor_gate text;
  v_patient_fk text;
  v_tables text[] := ARRAY[
    'appointment_followups',
    'appointment_history',
    'appointment_reminders',
    'appointment_waitlist',
    'appointments',
    'calls',
    'care_episodes',
    'clinical_case_states',
    'consultation_transcripts',
    'conversation_sessions',
    'dispatch_offers',
    'dispensation_clarifications',
    'dispensation_events',
    'dispensation_orders',
    'dispensation_validations',
    'lab_results',
    'medication_logs',
    'medical_certificates',
    'medical_chats',
    'medical_messages',
    'medical_orders',
    'medical_records',
    'patient_alerts',
    'patient_care_team',
    'patients',
    'pharmacy_audit_events',
    'pharmacy_consultation_requests',
    'pharmacy_dispatch_requests',
    'prescription_audit_events',
    'prescriptions',
    'symptom_reports',
    'telemedicine_sessions',
    'vital_signs'
  ];
BEGIN
  FOR v_policy IN
    SELECT p.polname, c.relname, p.polcmd,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY (v_tables)
  LOOP
    v_using := v_policy.using_expr;
    v_check := v_policy.check_expr;
    v_new_using := v_using;
    v_new_check := v_check;
    IF v_policy.polcmd='r' THEN
      v_patient_fk := NULL;
      SELECT ccu.table_name INTO v_patient_fk
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name=ccu.constraint_name AND tc.constraint_schema=ccu.constraint_schema
      WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
        AND tc.table_name=v_policy.relname AND kcu.column_name='patient_id'
      LIMIT 1;
      IF v_policy.relname='patients' THEN
        v_doctor_gate := 'public.is_clinically_authorized_doctor_read_for_patient(patients.id)';
      ELSIF v_patient_fk='patients' THEN
        v_doctor_gate := format('public.is_clinically_authorized_doctor_read_for_patient(%I.patient_id)',v_policy.relname);
      ELSIF v_patient_fk='profiles' THEN
        v_doctor_gate := format('public.doctor_has_patient_read_access(%I.patient_id)',v_policy.relname);
      ELSE
        v_doctor_gate := 'public.is_clinically_authorized_doctor_read()';
      END IF;
    ELSE
      v_doctor_gate := 'public.is_clinically_approved_doctor()';
    END IF;

    IF v_new_using IS NOT NULL THEN
      IF v_policy.polcmd='r' THEN
        v_new_using := replace(v_new_using, 'public.doctor_has_patient_access(', 'public.doctor_has_patient_read_access(');
        v_new_using := replace(v_new_using, 'doctor_has_patient_access(', 'doctor_has_patient_read_access(');
      END IF;
      v_new_using := replace(v_new_using, 'public.is_doctor()', v_doctor_gate);
      v_new_using := replace(v_new_using, 'is_doctor()', v_doctor_gate);
      v_new_using := regexp_replace(
        v_new_using,
        '((d|doctors)\.user_id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\)))',
        E'\\1 AND (SELECT ' || v_doctor_gate || ')',
        'gi'
      );
      v_new_using := regexp_replace(
        v_new_using,
        '(doctor_id = get_my_doctor_id\(\))',
        E'\\1 AND (SELECT ' || v_doctor_gate || ')',
        'gi'
      );
      v_new_using := regexp_replace(
        v_new_using,
        '(doctor_id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\)))',
        E'\\1 AND (SELECT ' || v_doctor_gate || ')',
        'gi'
      );
    END IF;

    IF v_new_check IS NOT NULL THEN
      v_new_check := replace(v_new_check, 'public.is_doctor()', 'public.is_clinically_approved_doctor()');
      v_new_check := replace(v_new_check, 'is_doctor()', 'public.is_clinically_approved_doctor()');
      v_new_check := regexp_replace(
        v_new_check,
        '((d|doctors)\.user_id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\)))',
        E'\\1 AND (SELECT ' || v_doctor_gate || ')',
        'gi'
      );
      v_new_check := regexp_replace(
        v_new_check,
        '(doctor_id = get_my_doctor_id\(\))',
        E'\\1 AND (SELECT ' || v_doctor_gate || ')',
        'gi'
      );
      v_new_check := regexp_replace(
        v_new_check,
        '(doctor_id = (auth\.uid\(\)|\( SELECT auth\.uid\(\) AS uid\)))',
        E'\\1 AND (SELECT ' || v_doctor_gate || ')',
        'gi'
      );
    END IF;

    IF v_new_using IS DISTINCT FROM v_using THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I USING (%s)',
        v_policy.polname, v_policy.relname, v_new_using
      );
    END IF;

    IF v_new_check IS DISTINCT FROM v_check THEN
      EXECUTE format(
        'ALTER POLICY %I ON public.%I WITH CHECK (%s)',
        v_policy.polname, v_policy.relname, v_new_check
      );
    END IF;
  END LOOP;
END;
$policies$;

COMMIT;
