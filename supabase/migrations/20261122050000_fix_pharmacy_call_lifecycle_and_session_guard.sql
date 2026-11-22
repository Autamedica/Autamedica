-- Fix pharmacy on-demand call lifecycle, Cloudflare session tracking, and
-- premature completion guard without relaxing RLS on pharmacy_dispatch_requests.
--
-- Root causes addressed:
-- 1. claim_pharmacy_request_tier left public.calls in 'requested' instead of
--    'accepted', causing Invalid call status transition on connecting/connected.
-- 2. update_call_status did not step through intermediate states
--    (requested -> accepted -> connecting -> connected -> ended).
-- 3. finish_pharmacy_consultation unconditionally marked requests 'completed'
--    even when patient_cf_session_id or doctor_cf_session_id was NULL (failed
--    connection), burning already-approved R$ 79 payments.

BEGIN;

-- 1. Ensure claim_pharmacy_request_tier advances public.calls to 'accepted'
--    when a physician accepts an offer, preserving all existing country,
--    license, clinical approval, and offer guards.
DO $patch_claim_call_status$
DECLARE
  v_definition text;
  v_old_insert text := $old$        INSERT INTO public.calls (doctor_id, patient_id, room_id, status)
        VALUES (v_resolved_doc_id, v_req.patient_id, v_req.cloudflare_room_id, 'requested')
        RETURNING id INTO v_call_id;$old$;
  v_new_insert text := $new$        INSERT INTO public.calls (doctor_id, patient_id, room_id, status, accepted_at)
        VALUES (v_resolved_doc_id, v_req.patient_id, v_req.cloudflare_room_id, 'accepted', NOW())
        RETURNING id INTO v_call_id;$new$;
  v_old_update text := $old$        UPDATE public.calls
        SET doctor_id = v_resolved_doc_id,
            patient_id = COALESCE(patient_id, v_req.patient_id),
            status = 'requested'
        WHERE id = v_call_id;$old$;
  v_new_update text := $new$        UPDATE public.calls
        SET doctor_id = v_resolved_doc_id,
            patient_id = COALESCE(patient_id, v_req.patient_id),
            status = CASE WHEN status IN ('requested', 'ringing') THEN 'accepted'::public.call_status ELSE status END
        WHERE id = v_call_id;$new$;
BEGIN
  SELECT pg_get_functiondef('public.claim_pharmacy_request_tier(uuid,uuid)'::regprocedure)
    INTO v_definition;

  IF position(v_old_insert IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old_insert, v_new_insert);
  END IF;
  IF position(v_old_update IN v_definition) > 0 THEN
    v_definition := replace(v_definition, v_old_update, v_new_update);
  END IF;

  IF position('app_private.is_doctor_dispatch_approved' IN v_definition) = 0
     OR position('VALID_OFFER_REQUIRED' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Claim function missing clinical approval or offer checks; refusing migration';
  END IF;

  EXECUTE v_definition;
END;
$patch_claim_call_status$;

-- 2. Step cleanly through canonical call transitions inside the SECURITY DEFINER
--    update_call_status RPC while keeping trg_validate_call_status strict.
CREATE OR REPLACE FUNCTION public.update_call_status(
  p_call_id uuid,
  p_status public.call_status,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor uuid := auth.uid();
  claim_role text := COALESCE(auth.jwt()->>'role', current_setting('request.jwt.claim.role', true), '');
  call_row public.calls%ROWTYPE;
BEGIN
  IF claim_role <> 'service_role' AND actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR length(COALESCE(p_reason, '')) > 500 THEN
    RAISE EXCEPTION 'Invalid call status request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO call_row FROM public.calls WHERE id = p_call_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF claim_role <> 'service_role' AND NOT (
    EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id = actor AND (d.id = call_row.doctor_id OR d.user_id = call_row.doctor_id))
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.user_id = actor AND (p.id = call_row.patient_id OR p.user_id = call_row.patient_id))
  ) THEN
    RAISE EXCEPTION 'Caller is not a call participant' USING ERRCODE = '42501';
  END IF;

  IF call_row.status = p_status THEN
    RETURN false;
  END IF;

  -- Terminal states cannot transition further.
  IF call_row.status::text IN ('declined', 'canceled', 'ended') THEN
    RETURN false;
  END IF;

  -- If ending before call was ever accepted, cancel cleanly instead of raising.
  IF p_status = 'ended'::public.call_status AND call_row.status::text IN ('requested', 'ringing') THEN
    UPDATE public.calls SET status = 'canceled'::public.call_status, reason = p_reason WHERE id = p_call_id;
    RETURN true;
  END IF;

  -- Step cleanly through requested -> accepted -> connecting -> connected
  -- so every transition obeys trg_validate_call_status and records audit events.
  IF p_status = 'connecting'::public.call_status AND call_row.status::text IN ('requested', 'ringing') THEN
    UPDATE public.calls SET status = 'accepted'::public.call_status WHERE id = p_call_id;
    UPDATE public.calls SET status = 'connecting'::public.call_status, reason = p_reason WHERE id = p_call_id;
    RETURN true;
  END IF;

  IF p_status = 'connected'::public.call_status THEN
    IF call_row.status::text IN ('requested', 'ringing') THEN
      UPDATE public.calls SET status = 'accepted'::public.call_status WHERE id = p_call_id;
      UPDATE public.calls SET status = 'connecting'::public.call_status WHERE id = p_call_id;
    ELSIF call_row.status::text = 'accepted' THEN
      UPDATE public.calls SET status = 'connecting'::public.call_status WHERE id = p_call_id;
    END IF;
    UPDATE public.calls SET status = 'connected'::public.call_status, reason = p_reason WHERE id = p_call_id;
    RETURN true;
  END IF;

  UPDATE public.calls SET status = p_status, reason = p_reason WHERE id = p_call_id;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_call_status(uuid, public.call_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_call_status(uuid, public.call_status, text) TO authenticated, service_role;

-- 3. Never mark a paid pharmacy consultation as 'completed' unless BOTH
--    participants actually established Cloudflare sessions (or calls.status = 'connected').
--    If the connection failed before both joined, free the doctor AND return the
--    dispatch request to 'searching' while keeping the approved payment intact.
CREATE OR REPLACE FUNCTION public.finish_pharmacy_consultation(
  p_doctor_id uuid,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_resolved_doc_id uuid;
  v_target_request_id uuid := p_request_id;
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_call_status text;
  v_both_sessions_ready boolean := false;
BEGIN
  SELECT id INTO v_resolved_doc_id
  FROM public.doctors
  WHERE id = p_doctor_id OR user_id = p_doctor_id
  LIMIT 1;

  IF v_resolved_doc_id IS NULL THEN
    v_resolved_doc_id := p_doctor_id;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR (SELECT user_id FROM public.doctors WHERE id = v_resolved_doc_id) IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para finalizar consulta de este médico' USING ERRCODE = '42501';
  END IF;

  IF v_target_request_id IS NULL THEN
    SELECT current_active_request_id INTO v_target_request_id
    FROM public.doctor_duty_status
    WHERE doctor_id = v_resolved_doc_id;
  END IF;

  IF v_target_request_id IS NOT NULL THEN
    SELECT * INTO v_req
    FROM public.pharmacy_dispatch_requests
    WHERE id = v_target_request_id
    FOR UPDATE;

    IF FOUND AND (
      auth.role() = 'service_role'
      OR v_req.assigned_doctor_id IS NULL
      OR v_req.assigned_doctor_id = v_resolved_doc_id
      OR v_req.assigned_doctor_id = p_doctor_id
    ) THEN
      IF v_req.call_id IS NOT NULL THEN
        SELECT status::text INTO v_call_status
        FROM public.calls
        WHERE id = v_req.call_id;
      END IF;

      -- Require proof that BOTH doctor and patient opened Cloudflare sessions
      -- (or that the linked call explicitly reached 'connected').
      v_both_sessions_ready := (
        NULLIF(btrim(COALESCE(v_req.doctor_cf_session_id, '')), '') IS NOT NULL
        AND NULLIF(btrim(COALESCE(v_req.patient_cf_session_id, '')), '') IS NOT NULL
      ) OR (v_call_status = 'connected');

      IF v_both_sessions_ready THEN
        UPDATE public.pharmacy_dispatch_requests
        SET status = 'completed',
            call_ended_at = COALESCE(call_ended_at, NOW())
        WHERE id = v_target_request_id;

        UPDATE public.pharmacy_consultation_requests
        SET status = 'completed',
            completed_at = COALESCE(completed_at, NOW())
        WHERE id = v_target_request_id;

        IF v_req.call_id IS NOT NULL AND v_call_status IN ('accepted', 'connecting', 'connected') THEN
          UPDATE public.calls
          SET status = 'ended'::public.call_status,
              reason = COALESCE(reason, 'consultation_completed')
          WHERE id = v_req.call_id;
        END IF;
      ELSE
        -- Connection never completed with both participants: do NOT burn the
        -- paid request as 'completed'. Requeue cleanly so the patient can be
        -- matched again without being charged twice, and detach the old call_id
        -- so the next claim creates a fresh 'accepted' call row.
        IF v_req.status IN ('matched', 'in_call') THEN
          UPDATE public.pharmacy_dispatch_requests
          SET status = 'searching',
              assigned_doctor_id = NULL,
              matched_at = NULL,
              call_started_at = NULL,
              call_id = NULL,
              doctor_cf_session_id = NULL,
              patient_cf_session_id = NULL,
              search_timeout_at = GREATEST(COALESCE(search_timeout_at, NOW()), NOW() + INTERVAL '15 minutes')
          WHERE id = v_target_request_id;
        END IF;

        IF v_req.call_id IS NOT NULL THEN
          IF v_call_status IN ('requested', 'ringing') THEN
            UPDATE public.calls
            SET status = 'canceled'::public.call_status,
                reason = 'connection_not_established'
            WHERE id = v_req.call_id;
          ELSIF v_call_status IN ('accepted', 'connecting') THEN
            UPDATE public.calls
            SET status = 'ended'::public.call_status,
                reason = 'connection_not_established'
            WHERE id = v_req.call_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Always release doctor duty lock so the clinician is not stranded.
  UPDATE public.doctor_duty_status
  SET current_active_request_id = NULL,
      updated_at = NOW()
  WHERE doctor_id = v_resolved_doc_id;

  RETURN jsonb_build_object(
    'success', true,
    'completed', v_both_sessions_ready,
    'reason', CASE WHEN v_both_sessions_ready THEN 'consultation_completed' ELSE 'connection_not_established' END,
    'doctor_id', v_resolved_doc_id,
    'request_id', v_target_request_id,
    'message', CASE
      WHEN v_both_sessions_ready THEN 'Guardia liberada y consulta finalizada exitosamente.'
      ELSE 'Conexión no completada con ambos participantes; solicitud conservada sin marcar como completada.'
    END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_pharmacy_consultation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_pharmacy_consultation(uuid, uuid) TO authenticated, service_role;

COMMIT;
