-- Restore guest appointment calls without relaxing doctor ownership.
-- NULL patient IDs are allowed only for a matching, callable guest appointment.
-- Registered patients must remain active. Existing calls and clinical data are unchanged.

CREATE OR REPLACE FUNCTION public.can_start_call(
  p_doctor_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors AS d
    LEFT JOIN public.patients AS p ON p.id = p_patient_id
    WHERE d.id = p_doctor_id
      AND d.user_id = (SELECT auth.uid())
      AND d.active = true
      AND (p_patient_id IS NULL OR p.active = true)
      AND (
        (p_appointment_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.appointments AS a
          WHERE a.id = p_appointment_id
            AND a.doctor_id = d.id
            AND a.patient_id IS NOT DISTINCT FROM p_patient_id
            AND a.deleted_at IS NULL
            AND a.type = 'telemedicine'
            AND a.status IN ('scheduled', 'confirmed', 'in_progress', 'no_show')
        ))
        OR
        (p_appointment_id IS NULL AND p_patient_id IS NOT NULL AND (
          EXISTS (
            SELECT 1 FROM public.patient_care_team AS pct
            WHERE pct.doctor_id = d.id AND pct.patient_id = p.id AND pct.active = true
          )
          OR EXISTS (
            SELECT 1 FROM public.doctor_patient AS dp
            WHERE dp.doctor_id = d.id AND dp.patient_id = p.id
          )
          OR EXISTS (
            SELECT 1 FROM public.appointments AS a
            WHERE a.doctor_id = d.id AND a.patient_id = p.id AND a.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM public.pharmacy_dispatch_requests AS r
            WHERE (r.assigned_doctor_id = d.id OR r.previous_doctor_id = d.id)
              AND (
                r.patient_id = p.id
                OR r.requested_by_user_id = p.user_id
                OR (p.dni IS NOT NULL AND r.patient_dni = p.dni)
                OR (p.cpf IS NOT NULL AND r.patient_cpf = p.cpf)
              )
          )
        ))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_start_call(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_start_call(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_call(
  p_doctor_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  room_id text,
  doctor_id uuid,
  patient_id uuid,
  status public.call_status,
  created_at timestamptz,
  appointment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_room_id text;
  v_call_id uuid;
  v_status public.call_status;
  v_created_at timestamptz;
  v_auth_user uuid := auth.uid();
  v_claim_role text := COALESCE(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
  v_is_service_role boolean := (v_claim_role = 'service_role');
  v_authorized boolean := false;
BEGIN
  IF p_doctor_id IS NULL OR (p_patient_id IS NULL AND p_appointment_id IS NULL) THEN
    RAISE EXCEPTION 'Doctor and either patient or appointment are required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.doctors AS d
    LEFT JOIN public.patients AS p ON p.id = p_patient_id
    WHERE d.id = p_doctor_id
      AND d.active = true
      AND (p_patient_id IS NULL OR p.active = true)
  ) THEN
    RAISE EXCEPTION 'Doctor or patient not active' USING ERRCODE = '42501';
  END IF;

  -- A normal signed-in user must be the doctor named in the request.
  -- A service-role client can invoke the RPC but cannot skip the relation checks.
  IF NOT v_is_service_role AND (
    v_auth_user IS NULL OR
    NOT EXISTS (
      SELECT 1 FROM public.doctors AS d
      WHERE d.id = p_doctor_id
        AND d.user_id = v_auth_user
        AND d.active = true
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden: caller is not the doctor' USING ERRCODE = '42501';
  END IF;

  IF p_appointment_id IS NOT NULL THEN
    -- Prevent attaching a call to another doctor's or patient's appointment,
    -- even when the caller has service-role privileges.
    SELECT EXISTS (
      SELECT 1
      FROM public.appointments AS a
      WHERE a.id = p_appointment_id
        AND a.doctor_id = p_doctor_id
        AND a.patient_id IS NOT DISTINCT FROM p_patient_id
        AND a.deleted_at IS NULL
        AND a.type = 'telemedicine'
        AND a.status IN ('scheduled', 'confirmed', 'in_progress', 'no_show')
    ) INTO v_authorized;
  ELSE
    -- The four existing sources of doctor/patient clinical relationship:
    -- care team, doctor-patient mapping, appointments, pharmacy dispatch.
    -- Check concrete IDs here so the service-role path is also protected.
    SELECT
      EXISTS (
        SELECT 1 FROM public.patient_care_team AS pct
        WHERE pct.doctor_id = p_doctor_id
          AND pct.patient_id = p_patient_id
          AND pct.active = true
      ) OR
      EXISTS (
        SELECT 1 FROM public.doctor_patient AS dp
        WHERE dp.doctor_id = p_doctor_id
          AND dp.patient_id = p_patient_id
      ) OR
      EXISTS (
        SELECT 1 FROM public.appointments AS a
        WHERE a.doctor_id = p_doctor_id
          AND a.patient_id = p_patient_id
          AND a.deleted_at IS NULL
      ) OR
      EXISTS (
        SELECT 1
        FROM public.pharmacy_dispatch_requests AS r
        JOIN public.patients AS p ON p.id = p_patient_id
        WHERE (r.assigned_doctor_id = p_doctor_id OR r.previous_doctor_id = p_doctor_id)
          AND (
            r.patient_id = p_patient_id
            OR r.requested_by_user_id = p.user_id
            OR (p.dni IS NOT NULL AND r.patient_dni = p.dni)
            OR (p.cpf IS NOT NULL AND r.patient_cpf = p.cpf)
          )
      )
    INTO v_authorized;
  END IF;

  IF NOT COALESCE(v_authorized, false) THEN
    RAISE EXCEPTION 'Forbidden: doctor-patient relationship not authorized'
      USING ERRCODE = '42501';
  END IF;

  v_room_id := 'room_' || pg_catalog.encode(extensions.gen_random_bytes(6), 'hex');

  INSERT INTO public.calls (doctor_id, patient_id, room_id, appointment_id)
  VALUES (p_doctor_id, p_patient_id, v_room_id, p_appointment_id)
  RETURNING calls.id, calls.status, calls.created_at
  INTO v_call_id, v_status, v_created_at;

  INSERT INTO public.call_events (call_id, type, payload)
  VALUES (
    v_call_id,
    'call_created',
    pg_catalog.jsonb_build_object(
      'doctor_id', p_doctor_id,
      'patient_id', p_patient_id,
      'room_id', v_room_id,
      'appointment_id', p_appointment_id
    )
  );

  RETURN QUERY
  SELECT v_call_id, v_room_id, p_doctor_id, p_patient_id, v_status, v_created_at, p_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_call(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_call(uuid, uuid, uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
