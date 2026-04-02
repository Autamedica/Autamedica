-- Resolve the last application-owned lint warnings that still appear on the
-- linked project after the broader hardening pass.

BEGIN;

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
  v_role text;
BEGIN
  IF NOT (public.is_doctor() OR public.is_system_admin()) THEN
    RAISE EXCEPTION 'unauthorized: only doctors and admins can assign care team members';
  END IF;

  -- Keep the legacy parameter contract even though the current schema no longer
  -- persists free-form notes on patient_care_team.
  PERFORM NULLIF(BTRIM(COALESCE(p_notes, '')), '');

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
  existing_role text;
BEGIN
  IF p_portal NOT IN ('patients','doctors','companies','admin') THEN
    RAISE EXCEPTION 'Invalid portal: %', p_portal;
  END IF;

  SELECT role INTO existing_role
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

  IF existing_role IS NOT NULL AND existing_role != 'admin' THEN
    RAISE EXCEPTION 'role_already_set: Cannot change role from % to %', existing_role, updated_role;
  END IF;

  IF updated_role = 'admin' AND (existing_role IS NULL OR existing_role != 'admin') THEN
    RAISE EXCEPTION 'unauthorized: Only existing admins can assign admin role';
  END IF;

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

  result_data := json_build_object(
    'success', true,
    'user_id', auth.uid(),
    'portal', p_portal,
    'role', updated_role,
    'organization_id', p_organization_id,
    'updated_at', now()
  );

  RETURN result_data;
END;
$$;

COMMIT;
