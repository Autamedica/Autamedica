-- Preserve clinical history; only privileged, actor-checked RPCs mutate calls.
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION public.validate_call_status_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE allowed boolean := false;
BEGIN
  -- Replayed updates cannot rewrite the first acceptance or final closing time.
  NEW.accepted_at := OLD.accepted_at;
  NEW.ended_at := OLD.ended_at;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  CASE OLD.status::text
    WHEN 'requested' THEN allowed := NEW.status::text IN ('ringing','accepted','declined','canceled');
    WHEN 'ringing' THEN allowed := NEW.status::text IN ('accepted','declined','canceled');
    WHEN 'accepted' THEN allowed := NEW.status::text IN ('connecting','connected','canceled','ended');
    WHEN 'connecting' THEN allowed := NEW.status::text IN ('connected','ended');
    WHEN 'connected' THEN allowed := NEW.status::text = 'ended';
    ELSE allowed := false;
  END CASE;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid call status transition' USING ERRCODE = '22023';
  END IF;
  IF NEW.status::text IN ('accepted','connecting','connected') THEN
    NEW.accepted_at := COALESCE(OLD.accepted_at, now());
  END IF;
  IF NEW.status::text IN ('ended','canceled','declined') THEN
    NEW.ended_at := COALESCE(OLD.ended_at, now());
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.validate_call_status_transition() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_call_status ON public.calls;
CREATE TRIGGER trg_validate_call_status BEFORE UPDATE ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.validate_call_status_transition();

-- Audit changes at the database boundary, including trusted server-side writers.
CREATE OR REPLACE FUNCTION app_private.audit_call_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.call_events(call_id, type, payload)
    VALUES (NEW.id, 'status_changed', jsonb_build_object(
      'old_status', OLD.status, 'new_status', NEW.status,
      'reason', NEW.reason, 'actor_user_id', auth.uid()
    ));
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION app_private.audit_call_status_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_audit_call_status_change ON public.calls;
CREATE TRIGGER trg_audit_call_status_change AFTER UPDATE OF status ON public.calls
FOR EACH ROW EXECUTE FUNCTION app_private.audit_call_status_change();

CREATE OR REPLACE FUNCTION public.update_call_status(
  p_call_id uuid, p_status public.call_status, p_reason text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  actor uuid := auth.uid();
  claim_role text := COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '');
  call_row public.calls%ROWTYPE;
BEGIN
  IF claim_role <> 'service_role' AND actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR length(COALESCE(p_reason,'')) > 500 THEN
    RAISE EXCEPTION 'Invalid call status request' USING ERRCODE = '22023';
  END IF;
  -- Serialize concurrent patient/doctor updates before deciding if work is needed.
  SELECT * INTO call_row FROM public.calls WHERE id = p_call_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF claim_role <> 'service_role' AND NOT (
    EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id = actor AND (d.id = call_row.doctor_id OR d.user_id = call_row.doctor_id))
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.user_id = actor AND (p.id = call_row.patient_id OR p.user_id = call_row.patient_id))
  ) THEN
    RAISE EXCEPTION 'Caller is not a call participant' USING ERRCODE = '42501';
  END IF;
  IF call_row.status = p_status THEN RETURN false; END IF;
  UPDATE public.calls SET status = p_status, reason = p_reason WHERE id = p_call_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.update_call_status(uuid, public.call_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_call_status(uuid, public.call_status, text) TO authenticated, service_role;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.calls FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.call_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.calls TO authenticated;
GRANT SELECT, INSERT ON public.call_events TO authenticated;

DROP POLICY IF EXISTS calls_participants_all ON public.calls;
DROP POLICY IF EXISTS calls_participants_read ON public.calls;
CREATE POLICY calls_participants_read ON public.calls FOR SELECT TO authenticated USING (
  doctor_id = (SELECT auth.uid()) OR patient_id = (SELECT auth.uid())
  OR doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = (SELECT auth.uid()))
  OR patient_id IN (SELECT p.id FROM public.patients p WHERE p.user_id = (SELECT auth.uid()))
);
DROP POLICY IF EXISTS call_events_for_participants ON public.call_events;
DROP POLICY IF EXISTS call_events_participants_read ON public.call_events;
DROP POLICY IF EXISTS call_events_participants_append ON public.call_events;
CREATE POLICY call_events_participants_read ON public.call_events FOR SELECT TO authenticated
USING (call_id IN (SELECT id FROM public.calls));
CREATE POLICY call_events_participants_append ON public.call_events FOR INSERT TO authenticated
WITH CHECK (type NOT IN ('status_changed','call_created') AND call_id IN (SELECT id FROM public.calls));
