-- Restore the appointment-aware call creation RPC after the remote schema
-- snapshot dropped it back to the legacy two-argument signature.
DROP FUNCTION IF EXISTS public.create_call(uuid, uuid);
DROP FUNCTION IF EXISTS public.create_call(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_call(
  p_doctor_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS TABLE(
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
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_room_id text;
  v_call_id uuid;
  v_status public.call_status;
  v_created_at timestamptz;
  v_auth_user uuid;
  v_claim_role text := COALESCE(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_is_service_role boolean := v_claim_role = 'service_role';
  v_is_doctor boolean := false;
BEGIN
  v_auth_user := auth.uid();

  IF NOT v_is_service_role THEN
    IF v_auth_user IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.user_id = v_auth_user
        AND (d.id = p_doctor_id OR d.user_id = p_doctor_id)
    )
    INTO v_is_doctor;

    IF NOT v_is_doctor THEN
      RAISE EXCEPTION 'Forbidden: only doctor participant can create call' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_room_id := 'room_' || encode(gen_random_bytes(6), 'hex');

  INSERT INTO public.calls (doctor_id, patient_id, room_id, appointment_id)
  VALUES (p_doctor_id, p_patient_id, v_room_id, p_appointment_id)
  RETURNING calls.id, calls.status, calls.created_at
  INTO v_call_id, v_status, v_created_at;

  INSERT INTO public.call_events (call_id, type, payload)
  VALUES (
    v_call_id,
    'call_created',
    jsonb_build_object(
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

ALTER FUNCTION public.create_call(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_call(uuid, uuid, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_call(uuid, uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.create_call(uuid, uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_call(uuid, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.create_call(uuid, uuid, uuid) IS
  'Creates a telemedicine call. appointment_id is optional for legacy direct patient calls and required by guest appointment flows.';
