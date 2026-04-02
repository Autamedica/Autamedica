-- Align production with the hardening already applied manually and fix
-- application-owned functions that still fail remote linting.

BEGIN;

-- ============================================================================
-- 1) Persist the production RLS hardening in migration history
-- ============================================================================

DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_select_all" ON public.doctor_availability;
DROP POLICY IF EXISTS "availability_insert_own" ON public.doctor_availability;
DROP POLICY IF EXISTS "availability_update_own" ON public.doctor_availability;
DROP POLICY IF EXISTS "availability_delete_own" ON public.doctor_availability;

CREATE POLICY "availability_select_all" ON public.doctor_availability
  FOR SELECT USING (true);

CREATE POLICY "availability_insert_own" ON public.doctor_availability
  FOR INSERT WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "availability_update_own" ON public.doctor_availability
  FOR UPDATE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "availability_delete_own" ON public.doctor_availability
  FOR DELETE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "overrides_select_all" ON public.doctor_availability_overrides;
DROP POLICY IF EXISTS "overrides_insert_own" ON public.doctor_availability_overrides;
DROP POLICY IF EXISTS "overrides_update_own" ON public.doctor_availability_overrides;
DROP POLICY IF EXISTS "overrides_delete_own" ON public.doctor_availability_overrides;

CREATE POLICY "overrides_select_all" ON public.doctor_availability_overrides
  FOR SELECT USING (true);

CREATE POLICY "overrides_insert_own" ON public.doctor_availability_overrides
  FOR INSERT WITH CHECK (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "overrides_update_own" ON public.doctor_availability_overrides
  FOR UPDATE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "overrides_delete_own" ON public.doctor_availability_overrides
  FOR DELETE USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "waitlist_select_own" ON public.appointment_waitlist;
DROP POLICY IF EXISTS "waitlist_insert_patient" ON public.appointment_waitlist;
DROP POLICY IF EXISTS "waitlist_update_own" ON public.appointment_waitlist;

CREATE POLICY "waitlist_select_own" ON public.appointment_waitlist
  FOR SELECT USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
    OR doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "waitlist_insert_patient" ON public.appointment_waitlist
  FOR INSERT WITH CHECK (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  );

CREATE POLICY "waitlist_update_own" ON public.appointment_waitlist
  FOR UPDATE USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
    OR doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "reminders_select_participants" ON public.appointment_reminders;

CREATE POLICY "reminders_select_participants" ON public.appointment_reminders
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM public.appointments
      WHERE patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
         OR doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "history_select_participants" ON public.appointment_history;

CREATE POLICY "history_select_participants" ON public.appointment_history
  FOR SELECT USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
    OR doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(coalesce(p.proconfig, '{}'::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_extension'::regclass
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions',
      r.schema_name,
      r.function_name,
      r.args
    );
  END LOOP;
END
$$;

-- ============================================================================
-- 2) Fix application-owned functions that still fail remote linting
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_to_care_team(
  p_doctor_id uuid,
  p_patient_id uuid,
  p_role text DEFAULT 'primary_doctor',
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_assignment_id uuid;
  v_current_user uuid;
  v_role text;
BEGIN
  v_current_user := auth.uid();

  IF NOT (public.is_doctor() OR public.is_system_admin()) THEN
    RAISE EXCEPTION 'unauthorized: only doctors and admins can assign care team members';
  END IF;

  -- Keep the legacy parameter contract, but normalize to the current enum.
  v_role := CASE COALESCE(p_role, 'primary')
    WHEN 'primary_doctor' THEN 'primary'
    WHEN 'primary' THEN 'primary'
    WHEN 'specialist' THEN 'specialist'
    WHEN 'consultant' THEN 'consultant'
    ELSE 'consultant'
  END;

  INSERT INTO public.patient_care_team (
    doctor_id,
    patient_id,
    role,
    assigned_date,
    active
  ) VALUES (
    p_doctor_id,
    p_patient_id,
    v_role,
    CURRENT_DATE,
    true
  )
  ON CONFLICT (patient_id, doctor_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    assigned_date = CURRENT_DATE,
    active = true,
    updated_at = NOW()
  RETURNING id INTO v_assignment_id;

  RETURN v_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_delete_expired_recordings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- consultation_recordings was retired from the live schema.
  -- Keep the function as a safe no-op for any legacy scheduler.
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.doctor_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_doctor_id uuid;
  v_patient_id uuid;
BEGIN
  IF NOT public.is_doctor() THEN
    RETURN false;
  END IF;

  SELECT id INTO v_doctor_id
  FROM public.doctors
  WHERE user_id = auth.uid() AND active = true
  LIMIT 1;

  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE user_id = patient_user_id AND active = true
  LIMIT 1;

  IF v_doctor_id IS NULL OR v_patient_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.patient_care_team pct
    WHERE pct.doctor_id = v_doctor_id
      AND pct.patient_id = v_patient_id
      AND pct.active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.find_nearby_health_centers(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision DEFAULT 50,
  max_results integer DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  name text,
  type text,
  address jsonb,
  phone text,
  distance_km double precision,
  offers_medication_method boolean,
  offers_surgical_method boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    hc.id,
    hc.name,
    hc.type,
    hc.address,
    hc.phone,
    ROUND(
      (
        ST_Distance(
          hc.coordinates::geography,
          ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
        ) / 1000.0
      )::numeric,
      2
    )::double precision AS distance_km,
    hc.offers_medication_method,
    hc.offers_surgical_method
  FROM public.health_centers hc
  WHERE hc.offers_ive_ile = true
    AND ST_DWithin(
      hc.coordinates::geography,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
      radius_km * 1000
    )
  ORDER BY distance_km ASC
  LIMIT max_results;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_external_id(role_prefix text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN role_prefix || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_recommended_screenings(
  patient_id_param uuid,
  include_overdue boolean DEFAULT true
)
RETURNS TABLE(
  screening_id uuid,
  screening_name text,
  category text,
  status text,
  next_due_date timestamptz,
  urgency text,
  reason text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  patient_age integer;
  patient_gender text;
BEGIN
  SELECT
    DATE_PART('year', AGE(birth_date)),
    gender
  INTO patient_age, patient_gender
  FROM public.patients
  WHERE id = patient_id_param;

  IF patient_age IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS screening_id,
    s.name AS screening_name,
    s.category,
    COALESCE(pscr.status, 'not_started') AS status,
    pscr.next_due_date,
    CASE
      WHEN pscr.status = 'overdue' THEN 'high'::text
      WHEN pscr.next_due_date IS NOT NULL
        AND pscr.next_due_date <= NOW() + INTERVAL '30 days' THEN 'medium'::text
      ELSE 'low'::text
    END AS urgency,
    CASE
      WHEN pscr.status = 'overdue' THEN 'Screening vencido - requiere atención'
      WHEN s.is_mandatory THEN 'Screening obligatorio según normativa argentina'
      ELSE 'Recomendado para su edad y perfil'
    END AS reason
  FROM public.preventive_screenings s
  LEFT JOIN public.patient_screenings pscr
    ON pscr.screening_id = s.id
   AND pscr.patient_id = patient_id_param
  WHERE (s.target_gender = 'all' OR s.target_gender = patient_gender)
    AND (s.min_age IS NULL OR patient_age >= s.min_age)
    AND (s.max_age IS NULL OR patient_age <= s.max_age)
    AND (include_overdue = true OR COALESCE(pscr.status, 'not_started') != 'overdue')
  ORDER BY
    CASE
      WHEN pscr.status = 'overdue' THEN 1
      WHEN s.is_mandatory THEN 2
      ELSE 3
    END,
    pscr.next_due_date NULLS LAST,
    s.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(target_user_id uuid DEFAULT auth.uid())
RETURNS public.user_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  user_role_value public.user_role;
BEGIN
  IF target_user_id != auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND role IN ('platform_admin', 'organization_admin')
    ) THEN
      RAISE EXCEPTION 'access_denied';
    END IF;
  END IF;

  SELECT role::public.user_role INTO user_role_value
  FROM public.profiles
  WHERE user_id = target_user_id;

  RETURN user_role_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_or_org_admin(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  identifier_column text;
  v_current_role text;
BEGIN
  IF p_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'user_id'
      ) THEN 'user_id'
      WHEN EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'id'
      ) THEN 'id'
      ELSE NULL
    END
  INTO identifier_column;

  IF identifier_column IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format(
    'SELECT role::text FROM public.profiles WHERE %I = $1 LIMIT 1',
    identifier_column
  )
  INTO v_current_role
  USING p_uid;

  RETURN v_current_role IN ('platform_admin', 'organization_admin', 'admin');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_portal_and_role(
  p_portal text,
  p_role text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_data json;
  updated_role text;
  current_role text;
BEGIN
  IF p_portal NOT IN ('patients','doctors','companies','admin') THEN
    RAISE EXCEPTION 'Invalid portal: %', p_portal;
  END IF;

  SELECT role INTO current_role
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', auth.uid();
  END IF;

  IF p_role IS NULL THEN
    CASE p_portal
      WHEN 'doctors' THEN updated_role := 'doctor';
      WHEN 'companies' THEN updated_role := 'company';
      WHEN 'admin' THEN updated_role := 'admin';
      ELSE updated_role := 'patient';
    END CASE;
  ELSE
    updated_role := p_role;
  END IF;

  IF updated_role NOT IN ('patient','doctor','company','admin') THEN
    RAISE EXCEPTION 'Invalid role: %', updated_role;
  END IF;

  IF current_role IS NOT NULL AND current_role != 'admin' THEN
    RAISE EXCEPTION 'role_already_set: Cannot change role from % to %', current_role, updated_role;
  END IF;

  IF updated_role = 'admin' AND (current_role IS NULL OR current_role != 'admin') THEN
    RAISE EXCEPTION 'unauthorized: Only existing admins can assign admin role';
  END IF;

  -- The current profiles schema no longer stores portal/organization columns.
  UPDATE public.profiles
  SET role = updated_role,
      updated_at = now()
  WHERE user_id = auth.uid();

  IF updated_role = 'doctor' THEN
    INSERT INTO public.doctors (user_id)
    VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF updated_role = 'patient' THEN
    INSERT INTO public.patients (user_id)
    VALUES (auth.uid())
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  SELECT json_build_object(
    'user_id', auth.uid(),
    'portal', p_portal,
    'role', updated_role,
    'organization_id', p_organization_id,
    'updated_at', now()
  ) INTO result_data;

  RETURN result_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_company(target_organization_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF target_organization_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.profiles p ON p.user_id = cm.profile_id
    WHERE cm.profile_id = auth.uid()
      AND cm.company_id = target_organization_id
      AND cm.active = true
      AND p.active = true
  );
END;
$$;

COMMIT;
