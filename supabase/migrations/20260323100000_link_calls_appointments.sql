-- Link calls to appointments + sync status + validate transitions
-- Fase 1: Integración Appointment ↔ Call

-- 1. Add appointment_id FK to calls
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS appointment_id uuid
  REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_appointment_id
  ON public.calls (appointment_id);

-- 2. Trigger: sync call status → appointment status
CREATE OR REPLACE FUNCTION public.sync_call_to_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Call connected → appointment in_progress
  IF NEW.status = 'connected' AND OLD.status IS DISTINCT FROM 'connected' THEN
    UPDATE public.appointments
    SET status = 'in_progress', updated_at = now()
    WHERE id = NEW.appointment_id
      AND status IN ('scheduled', 'confirmed');
  END IF;

  -- Call ended → appointment completed
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' THEN
    UPDATE public.appointments
    SET status = 'completed', updated_at = now()
    WHERE id = NEW.appointment_id
      AND status = 'in_progress';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_call_to_appointment ON public.calls;
CREATE TRIGGER trg_sync_call_to_appointment
  AFTER UPDATE OF status ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_call_to_appointment();

-- 3. Validate call status transitions
CREATE OR REPLACE FUNCTION public.validate_call_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  valid BOOLEAN := FALSE;
BEGIN
  -- Allow if status didn't change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Valid transitions
  CASE OLD.status
    WHEN 'requested' THEN
      valid := NEW.status IN ('ringing', 'canceled');
    WHEN 'ringing' THEN
      valid := NEW.status IN ('accepted', 'declined', 'canceled');
    WHEN 'accepted' THEN
      valid := NEW.status IN ('connecting', 'canceled', 'ended');
    WHEN 'connecting' THEN
      valid := NEW.status IN ('connected', 'ended');
    WHEN 'connected' THEN
      valid := NEW.status IN ('ended');
    ELSE
      -- Terminal states: declined, canceled, ended — no transitions allowed
      valid := FALSE;
  END CASE;

  IF NOT valid THEN
    RAISE EXCEPTION 'Invalid call status transition: % → %', OLD.status, NEW.status
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_call_status ON public.calls;
CREATE TRIGGER trg_validate_call_status
  BEFORE UPDATE OF status ON public.calls
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_call_status_transition();

-- 4. Update create_call to accept appointment_id
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

  INSERT INTO public.calls (doctor_id, patient_id, room_id, appointment_id)
  VALUES (p_doctor_id, p_patient_id, v_room_id, p_appointment_id)
  RETURNING calls.id INTO v_call_id;

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
  SELECT v_call_id, v_room_id, p_doctor_id, p_patient_id,
         'requested'::public.call_status, NOW(), p_appointment_id;
END;
$$;

ALTER FUNCTION public.create_call(uuid, uuid, uuid) OWNER TO postgres;
