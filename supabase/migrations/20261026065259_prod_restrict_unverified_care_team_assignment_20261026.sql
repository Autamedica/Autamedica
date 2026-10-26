-- Prevent BOLA/IDOR through patient_care_team. A doctor's role alone does
-- not authorize adding themselves or another doctor to an unrelated patient.
-- A clinical relationship must exist independently of patient_care_team.
CREATE OR REPLACE FUNCTION public.can_self_assign_care_team(
  p_doctor_id uuid, p_patient_id uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $eligible$
  SELECT (SELECT auth.uid()) IS NOT NULL
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
        AND d.active IS TRUE
        AND NULLIF(btrim(d.license_number), '') IS NOT NULL
        AND upper(btrim(d.license_number)) !~ '^PENDING'
    );
$eligible$;

REVOKE EXECUTE ON FUNCTION public.can_self_assign_care_team(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_self_assign_care_team(uuid,uuid)
  TO authenticated, service_role;

ALTER POLICY patient_care_team_insert_scoped ON public.patient_care_team
  TO authenticated, service_role
  WITH CHECK (
    public.is_system_admin()
    OR public.can_self_assign_care_team(doctor_id, patient_id)
  );

ALTER POLICY patient_care_team_update_scoped ON public.patient_care_team
  TO authenticated, service_role
  USING (
    public.is_system_admin()
    OR public.can_self_assign_care_team(doctor_id, patient_id)
  )
  WITH CHECK (
    public.is_system_admin()
    OR public.can_self_assign_care_team(doctor_id, patient_id)
  );

CREATE OR REPLACE FUNCTION public.add_to_care_team(
  p_doctor_id uuid, p_patient_id uuid,
  p_role text DEFAULT 'primary_doctor',
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $assign$
DECLARE
  v_assignment_id uuid;
  v_role text;
BEGIN
  IF NOT (
    public.can_self_assign_care_team(p_doctor_id, p_patient_id)
    OR (
      public.is_system_admin()
      AND EXISTS (
        SELECT 1 FROM public.doctors d
         WHERE d.id = p_doctor_id AND d.active IS TRUE
           AND NULLIF(btrim(d.license_number), '') IS NOT NULL
           AND upper(btrim(d.license_number)) !~ '^PENDING'
      )
    )
  ) THEN
    RAISE EXCEPTION 'care_team_access_denied' USING ERRCODE = '42501';
  END IF;

  PERFORM NULLIF(btrim(COALESCE(p_notes, '')), '');

  v_role := CASE COALESCE(p_role, 'primary')
    WHEN 'primary_doctor' THEN 'primary'
    WHEN 'primary' THEN 'primary'
    WHEN 'specialist' THEN 'specialist'
    WHEN 'consultant' THEN 'consultant'
    ELSE 'consultant'
  END;

  INSERT INTO public.patient_care_team
    (doctor_id, patient_id, role, assigned_date, active)
  VALUES
    (p_doctor_id, p_patient_id, v_role, CURRENT_DATE, true)
  ON CONFLICT (patient_id, doctor_id)
  DO UPDATE SET role = EXCLUDED.role, assigned_date = CURRENT_DATE,
                active = true, updated_at = now()
  RETURNING id INTO v_assignment_id;

  RETURN v_assignment_id;
END;
$assign$;

REVOKE EXECUTE ON FUNCTION public.add_to_care_team(uuid,uuid,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_to_care_team(uuid,uuid,text,text)
  TO authenticated, service_role;
