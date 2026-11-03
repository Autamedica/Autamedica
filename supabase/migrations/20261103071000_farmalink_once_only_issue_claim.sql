-- Farmalink once-only outbound reservation. RPC access: server-side service_role only.
-- No migrations are applied to staging or production by this PR.
-- One row per prescription means duplicate issue requests cannot send another alta.
CREATE TABLE IF NOT EXISTS public.farmalink_issue_attempts (
  prescription_id uuid PRIMARY KEY REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  attempt_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  doctor_user_id uuid NOT NULL,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'unknown', 'rejected', 'confirmed')),
  vendor_id text,
  response_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farmalink_confirmed_requires_vendor_id
    CHECK (state <> 'confirmed' OR (vendor_id IS NOT NULL AND length(btrim(vendor_id)) > 0)),
  CONSTRAINT farmalink_other_states_no_vendor_id
    CHECK (state = 'confirmed' OR vendor_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS farmalink_issue_attempts_vendor_id_unique
 ON public.farmalink_issue_attempts (vendor_id) WHERE vendor_id IS NOT NULL;

ALTER TABLE public.farmalink_issue_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farmalink_issue_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.farmalink_issue_attempts TO service_role;
-- Only tightly scoped database functions below may manage attempts.

-- Remove the pre-validation draft signature if this unshipped migration was rehearsed before.
DROP FUNCTION IF EXISTS public.claim_farmalink_issue(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.claim_farmalink_issue(
  p_prescription_id uuid,
  p_request_sha256 text,
  p_actor_user_id uuid,
  p_expected_clinical_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_attempt_id uuid;
  v_state text;
BEGIN
  IF current_user <> 'service_role' OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'farmalink_server_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_clinical_data IS NULL THEN
    RAISE EXCEPTION 'farmalink_missing_clinical_snapshot' USING ERRCODE = '22023';
  END IF;
  IF p_request_sha256 IS NULL OR p_request_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'farmalink_invalid_request_hash' USING ERRCODE = '22023';
  END IF;

  -- Take a lock on the prescription before reserving an outbound call.
  -- The lock serializes concurrent claims in the same PostgreSQL transaction.
  PERFORM 1
  FROM public.prescriptions p
  JOIN public.doctors d ON d.id = p.doctor_id
  JOIN public.patients pt ON pt.id = p.patient_id
  JOIN public.profiles pr ON pr.user_id = d.user_id
  WHERE p.id = p_prescription_id
    AND d.user_id = p_actor_user_id
    AND p.country_code = 'AR'
    AND p.status = 'draft'
    AND p.clinical_data IS NOT DISTINCT FROM p_expected_clinical_data
    AND d.care_country = 'AR' AND d.active IS TRUE
    AND pt.care_country = 'AR' AND pt.active IS TRUE
    AND pr.active IS TRUE AND pr.role = 'doctor'
    AND pr.sss_validation_status = 'valid'
    AND NULLIF(btrim(d.refeps_id), '') IS NOT NULL
    AND NULLIF(btrim(d.professional_address), '') IS NOT NULL
    AND p.cuir IS NULL
  FOR UPDATE OF p;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'farmalink_prescription_not_eligible' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.farmalink_issue_attempts
    (prescription_id, doctor_user_id, request_sha256)
  VALUES
    (p_prescription_id, p_actor_user_id, p_request_sha256)
  ON CONFLICT (prescription_id) DO NOTHING
  RETURNING attempt_id, state INTO v_attempt_id, v_state;

  IF FOUND THEN
    RETURN jsonb_build_object('claimed', true, 'attempt_id', v_attempt_id, 'state', v_state);
  END IF;

  SELECT a.attempt_id, a.state INTO v_attempt_id, v_state
  FROM public.farmalink_issue_attempts a
  WHERE a.prescription_id = p_prescription_id;

  RETURN jsonb_build_object('claimed', false, 'attempt_id', v_attempt_id, 'state', v_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_farmalink_issue(
  p_prescription_id uuid,
  p_attempt_id uuid,
  p_state text,
  p_actor_user_id uuid,
  p_vendor_id text DEFAULT NULL,
  p_response_code text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF current_user <> 'service_role' OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'farmalink_server_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_state NOT IN ('unknown', 'rejected', 'confirmed') OR p_state IS NULL THEN
    RAISE EXCEPTION 'farmalink_invalid_state' USING ERRCODE = '22023';
  END IF;
  IF p_state = 'confirmed' AND (p_vendor_id IS NULL OR p_vendor_id !~ '^[0-9]{1,32}$'
      OR p_response_code IS NULL OR p_response_code NOT IN ('00', '0')) THEN
    RAISE EXCEPTION 'farmalink_missing_vendor_id' USING ERRCODE = '22023';
  END IF;
  IF p_state <> 'confirmed' AND p_vendor_id IS NOT NULL THEN
    RAISE EXCEPTION 'farmalink_vendor_id_without_approval' USING ERRCODE = '22023';
  END IF;

  UPDATE public.farmalink_issue_attempts a
  SET state = p_state,
      vendor_id = p_vendor_id,
      response_code = left(p_response_code, 32),
      updated_at = now()
  FROM public.prescriptions p
  JOIN public.doctors d ON d.id = p.doctor_id
  WHERE a.prescription_id = p_prescription_id
    AND p.id = a.prescription_id
    AND a.attempt_id = p_attempt_id
    AND a.doctor_user_id = p_actor_user_id
    AND d.user_id = p_actor_user_id
    AND p.country_code = 'AR'
    AND a.state = 'reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Public exposed functions are NOT public APIs: service-role only; doctor ownership checked from server-supplied actor.
REVOKE ALL ON FUNCTION public.claim_farmalink_issue(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_farmalink_issue(uuid, uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_farmalink_issue(uuid, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_farmalink_issue(uuid, uuid, text, uuid, text, text) TO service_role;

COMMENT ON TABLE public.farmalink_issue_attempts IS
 'Once-only outbound registration reservation. Never delete/reset rows to retry without vendor reconciliation; attempts can be ambiguous after HTTP timeouts.';


-- Freeze the clinical identity/content after reservation, even for service-role API writes.
-- A definer trigger is needed because browser roles cannot read the private attempts table.
CREATE OR REPLACE FUNCTION app_private.guard_farmalink_prescription_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.patient_id, NEW.doctor_id, NEW.country_code, NEW.clinical_data)
       IS DISTINCT FROM (OLD.patient_id, OLD.doctor_id, OLD.country_code, OLD.clinical_data)
       AND EXISTS (SELECT 1 FROM public.farmalink_issue_attempts a WHERE a.prescription_id = OLD.id) THEN
      RAISE EXCEPTION 'farmalink_snapshot_immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.vendor_name = 'farmalink' AND NOT EXISTS (
    SELECT 1 FROM public.farmalink_issue_attempts a
    WHERE a.prescription_id = NEW.id AND a.state = 'confirmed'
      AND a.vendor_id = NEW.vendor_id AND a.response_code IN ('00', '0')
  ) THEN
    RAISE EXCEPTION 'farmalink_unconfirmed_vendor' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_farmalink_prescription_snapshot() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_farmalink_prescription_snapshot ON public.prescriptions;
CREATE TRIGGER trg_farmalink_prescription_snapshot BEFORE INSERT OR UPDATE ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION app_private.guard_farmalink_prescription_snapshot();
