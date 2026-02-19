-- Secure RPC fallback for call flows when Edge Functions are not deployed.
-- Strategy:
-- 1) Keep SECURITY DEFINER and explicit search_path.
-- 2) Enforce participant authorization using auth.uid()/auth.jwt().
-- 3) Allow execute for authenticated + service_role.

CREATE OR REPLACE FUNCTION public.create_call(p_doctor_id uuid, p_patient_id uuid)
RETURNS TABLE(
  id uuid,
  room_id text,
  doctor_id uuid,
  patient_id uuid,
  status public.call_status,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_room_id TEXT;
  v_call_id UUID;
  v_auth_user UUID;
  v_claim_role TEXT := COALESCE(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', TRUE), '');
  v_is_service_role BOOLEAN := v_claim_role = 'service_role';
  v_is_doctor BOOLEAN := FALSE;
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

  INSERT INTO public.calls (doctor_id, patient_id, room_id)
  VALUES (p_doctor_id, p_patient_id, v_room_id)
  RETURNING calls.id, calls.room_id, calls.doctor_id, calls.patient_id, calls.status, calls.created_at
  INTO v_call_id, v_room_id, p_doctor_id, p_patient_id, status, created_at;

  INSERT INTO public.call_events (call_id, type, payload)
  VALUES (
    v_call_id,
    'call_created',
    jsonb_build_object(
      'doctor_id', p_doctor_id,
      'patient_id', p_patient_id,
      'room_id', v_room_id
    )
  );

  RETURN QUERY
  SELECT v_call_id, v_room_id, p_doctor_id, p_patient_id, 'requested'::public.call_status, NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_call_status(
  p_call_id uuid,
  p_status public.call_status,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_updated BOOLEAN := FALSE;
  v_row_count INTEGER := 0;
  v_auth_user UUID;
  v_claim_role TEXT := COALESCE(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', TRUE), '');
  v_is_service_role BOOLEAN := v_claim_role = 'service_role';
  v_doctor_id UUID;
  v_patient_id UUID;
  v_is_participant BOOLEAN := FALSE;
BEGIN
  v_auth_user := auth.uid();

  SELECT c.doctor_id, c.patient_id
  INTO v_doctor_id, v_patient_id
  FROM public.calls c
  WHERE c.id = p_call_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF NOT v_is_service_role THEN
    IF v_auth_user IS NULL THEN
      RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.doctors d
      WHERE d.user_id = v_auth_user
        AND (d.id = v_doctor_id OR d.user_id = v_doctor_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.user_id = v_auth_user
        AND (p.id = v_patient_id OR p.user_id = v_patient_id)
    )
    INTO v_is_participant;

    IF NOT v_is_participant THEN
      RAISE EXCEPTION 'Forbidden: caller is not call participant' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.calls
  SET
    status = p_status,
    reason = p_reason,
    accepted_at = CASE WHEN p_status = 'accepted' THEN NOW() ELSE accepted_at END,
    ended_at = CASE WHEN p_status = 'ended' THEN NOW() ELSE ended_at END
  WHERE id = p_call_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_updated := v_row_count > 0;

  IF v_updated THEN
    INSERT INTO public.call_events (call_id, type, payload)
    VALUES (
      p_call_id,
      'status_changed',
      jsonb_build_object(
        'new_status', p_status,
        'reason', p_reason
      )
    );
  END IF;

  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_call(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_call(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_call(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_call(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_call(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.update_call_status(uuid, public.call_status, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_call_status(uuid, public.call_status, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_call_status(uuid, public.call_status, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_call_status(uuid, public.call_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_call_status(uuid, public.call_status, text) TO service_role;
