-- Prepared only. Do not apply to production without independent release validation.
ALTER TABLE public.farmalink_issue_attempts ADD COLUMN IF NOT EXISTS issue_snapshot jsonb;
ALTER TABLE public.farmalink_issue_attempts ADD COLUMN IF NOT EXISTS artifact_path text;
ALTER TABLE public.farmalink_issue_attempts ADD COLUMN IF NOT EXISTS artifact_sha256 text;
COMMENT ON COLUMN public.farmalink_issue_attempts.issue_snapshot IS
 'Protected clinical/PDF snapshot. Service role only. Contains personal health information; never log or return in pending lists.';

CREATE TABLE IF NOT EXISTS public.farmalink_operation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
 attempt_id uuid NOT NULL REFERENCES public.farmalink_issue_attempts(attempt_id) ON DELETE RESTRICT,
 actor_user_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('reconciled','artifact_committed','artifact_superseded')),
 evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
 provider_reference text,
 artifact_path text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.farmalink_operation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farmalink_operation_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.farmalink_operation_events TO service_role;

CREATE OR REPLACE FUNCTION app_private.guard_farmalink_operation_event()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'farmalink_audit_immutable' USING ERRCODE='42501'; END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_farmalink_operation_event() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_farmalink_operation_immutable ON public.farmalink_operation_events;
CREATE TRIGGER trg_farmalink_operation_immutable BEFORE UPDATE OR DELETE ON public.farmalink_operation_events
FOR EACH ROW EXECUTE FUNCTION app_private.guard_farmalink_operation_event();

CREATE OR REPLACE FUNCTION app_private.guard_farmalink_issue_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.prescription_id IS DISTINCT FROM OLD.prescription_id OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
 OR NEW.doctor_user_id IS DISTINCT FROM OLD.doctor_user_id OR NEW.request_sha256 IS DISTINCT FROM OLD.request_sha256
 OR NEW.issue_snapshot IS DISTINCT FROM OLD.issue_snapshot THEN
   RAISE EXCEPTION 'farmalink_issue_snapshot_immutable' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_farmalink_issue_snapshot() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_farmalink_issue_snapshot ON public.farmalink_issue_attempts;
CREATE TRIGGER trg_farmalink_issue_snapshot BEFORE UPDATE ON public.farmalink_issue_attempts
FOR EACH ROW EXECUTE FUNCTION app_private.guard_farmalink_issue_snapshot();

-- The old app fails closed after this migration until the new app is deployed.
DROP FUNCTION IF EXISTS public.claim_farmalink_issue(uuid,text,uuid,jsonb);
CREATE OR REPLACE FUNCTION public.claim_farmalink_issue(
  p_prescription_id uuid,
  p_request_sha256 text,
  p_actor_user_id uuid,
  p_expected_clinical_data jsonb,
  p_issue_snapshot jsonb
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

  IF p_issue_snapshot->>'actorUserId' IS DISTINCT FROM p_actor_user_id::text THEN
    RAISE EXCEPTION 'farmalink_actor_snapshot_mismatch' USING ERRCODE='42501'; END IF;
  IF p_issue_snapshot IS NULL OR jsonb_typeof(p_issue_snapshot) <> 'object'
    OR p_issue_snapshot->>'version' IS DISTINCT FROM '1'
    OR p_issue_snapshot->>'prescriptionId' IS DISTINCT FROM p_prescription_id::text
    OR p_issue_snapshot->'clinicalData' IS DISTINCT FROM p_expected_clinical_data
    OR p_issue_snapshot#>>'{pdfInput,prescriptionId}' IS DISTINCT FROM p_prescription_id::text
    OR p_issue_snapshot#>>'{pdfInput,existingCuir}' !~ '^[0-9]{41}$'
    OR p_issue_snapshot#>>'{pdfInput,existingCuir}' IS NULL
    OR p_issue_snapshot#>>'{pdfInput,issuedAt}' IS NULL
    OR p_issue_snapshot#>>'{pdfInput,expiresAt}' IS NULL
    OR jsonb_typeof(p_issue_snapshot->'dispensationOrder') IS DISTINCT FROM 'object'
    OR octet_length(p_issue_snapshot::text) > 131072 THEN
    RAISE EXCEPTION 'farmalink_invalid_issue_snapshot' USING ERRCODE='22023';
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
    AND d.id::text = p_issue_snapshot->>'doctorId'
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
    (prescription_id, doctor_user_id, request_sha256, issue_snapshot)
  VALUES
    (p_prescription_id, p_actor_user_id, p_request_sha256, p_issue_snapshot)
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


REVOKE ALL ON FUNCTION public.claim_farmalink_issue(uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_farmalink_issue(uuid,text,uuid,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.get_farmalink_recovery(p_prescription_id uuid,p_actor_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.farmalink_issue_attempts%ROWTYPE;
BEGIN
 IF current_user <> 'service_role' OR p_actor_user_id IS NULL THEN
  RAISE EXCEPTION 'farmalink_server_role_required' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO a FROM public.farmalink_issue_attempts x
 JOIN public.prescriptions p ON p.id=x.prescription_id
 JOIN public.doctors d ON d.id=p.doctor_id
 JOIN public.profiles pr ON pr.user_id=d.user_id
 WHERE x.prescription_id=p_prescription_id AND x.doctor_user_id=p_actor_user_id
 AND d.user_id=p_actor_user_id AND d.active IS TRUE AND d.care_country='AR'
 AND pr.active IS TRUE AND pr.role='doctor' AND p.country_code='AR' AND p.status IN ('draft','sent');
 IF NOT FOUND THEN RAISE EXCEPTION 'farmalink_recovery_forbidden' USING ERRCODE='42501'; END IF;
 IF a.state <> 'confirmed' OR a.issue_snapshot IS NULL OR a.response_code NOT IN ('00','0') THEN
  RAISE EXCEPTION 'farmalink_recovery_not_confirmed' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('attempt_id',a.attempt_id,'vendor_id',a.vendor_id,
  'response_code',a.response_code,'snapshot',a.issue_snapshot,'artifact_path',a.artifact_path);
END;
$$;
REVOKE ALL ON FUNCTION public.get_farmalink_recovery(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_farmalink_recovery(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_farmalink_artifact(
 p_prescription_id uuid,p_attempt_id uuid,p_actor_user_id uuid,p_artifact_path text,
 p_artifact_sha256 text,p_signature_method text,p_signed_pdf_url text,p_operation text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.farmalink_issue_attempts%ROWTYPE; p public.prescriptions%ROWTYPE;
 v_cuir text; v_pdf jsonb; v_action text; v_fields public.prescriptions%ROWTYPE;
BEGIN
 IF current_user <> 'service_role' OR p_actor_user_id IS NULL THEN
  RAISE EXCEPTION 'farmalink_server_role_required' USING ERRCODE='42501'; END IF;
 -- Same lock order as claim: prescription first, then attempt.
 SELECT * INTO p FROM public.prescriptions WHERE id=p_prescription_id FOR UPDATE;
 SELECT x.* INTO a FROM public.farmalink_issue_attempts x JOIN public.doctors d ON d.id=p.doctor_id
 JOIN public.profiles pr ON pr.user_id=d.user_id
 JOIN public.patients pt ON pt.id=p.patient_id
 WHERE x.prescription_id=p.id AND x.attempt_id=p_attempt_id AND x.doctor_user_id=p_actor_user_id
 AND d.user_id=p_actor_user_id AND d.care_country='AR' AND d.active IS TRUE
 AND p.country_code='AR' AND pr.active IS TRUE AND pr.role='doctor'
 AND pt.active IS TRUE AND pt.care_country='AR' FOR UPDATE OF x;
 IF NOT FOUND OR a.state <> 'confirmed' OR a.issue_snapshot IS NULL OR a.response_code NOT IN ('00','0') THEN
  RAISE EXCEPTION 'farmalink_recovery_forbidden' USING ERRCODE='42501'; END IF;
 IF p.status NOT IN ('draft','sent') OR (a.artifact_path IS NULL AND p.status <> 'draft') THEN
  RAISE EXCEPTION 'farmalink_recovery_lifecycle_blocked' USING ERRCODE='55000'; END IF;
 v_pdf := a.issue_snapshot->'pdfInput'; v_cuir:=v_pdf->>'existingCuir';
 v_fields := jsonb_populate_record(NULL::public.prescriptions,a.issue_snapshot->'dispensationOrder');
 IF p_signed_pdf_url IS NULL OR p_signed_pdf_url NOT LIKE 'https://%' OR p_artifact_sha256 IS NULL OR p_artifact_sha256 !~ '^[0-9a-f]{64}$'
 OR p_signature_method IS NULL OR p_signature_method NOT IN ('electronic_simple','ac_external')
 OR p_operation IS NULL OR p_operation NOT IN ('initial','recovery')
 OR p_artifact_path IS NULL OR p_artifact_path NOT LIKE 'prescriptions/'||v_cuir||'/%'
 OR p_artifact_path LIKE '%..%' THEN
  RAISE EXCEPTION 'farmalink_invalid_artifact' USING ERRCODE='22023'; END IF;
 IF p.cuir IS NOT NULL AND p.cuir IS DISTINCT FROM v_cuir THEN
  RAISE EXCEPTION 'farmalink_cuir_conflict' USING ERRCODE='23505'; END IF;
 IF a.artifact_path IS NULL AND (v_pdf->>'expiresAt')::timestamptz < now() THEN
  RAISE EXCEPTION 'farmalink_recovery_expired' USING ERRCODE='55000'; END IF;
 IF a.artifact_path IS NOT NULL THEN v_action:='artifact_superseded';
 ELSE
  UPDATE public.prescriptions SET cuir=v_cuir,status='sent',vendor_name='farmalink',vendor_id=a.vendor_id,
   qr_code_content='https://www.autamedica.com/verify/'||v_cuir,
   signature_method=p_signature_method,signed_pdf_url=p_signed_pdf_url,
   drug_category=v_fields.drug_category,
   is_controlled_substance=v_fields.is_controlled_substance,
   controlled_substance_list=v_fields.controlled_substance_list
  WHERE id=p.id;
  INSERT INTO public.dispensation_orders(
   prescription_id,patient_id,doctor_id,prescription_type,medication,formulation,quantity_units,duration_days,
   dispense_window_start,dispense_window_end,clinical_semaphore,semaphore_reasons,requires_clarification,internal_notes)
  SELECT p.id,p.patient_id,p.doctor_id,o.prescription_type,o.medication,o.formulation,o.quantity_units,o.duration_days,
   o.dispense_window_start,o.dispense_window_end,o.clinical_semaphore,o.semaphore_reasons,false,o.internal_notes
  FROM jsonb_populate_record(NULL::public.dispensation_orders,a.issue_snapshot->'dispensationOrder') o
  WHERE NOT EXISTS(SELECT 1 FROM public.dispensation_orders WHERE prescription_id=p.id);
  UPDATE public.farmalink_issue_attempts SET artifact_path=p_artifact_path,artifact_sha256=p_artifact_sha256,updated_at=now()
  WHERE prescription_id=p.id;
  INSERT INTO public.prescription_audit_events(prescription_id,event_type,user_id,signature_hash,metadata)
  VALUES(p.id,'issued',p_actor_user_id,p_artifact_sha256,jsonb_build_object(
   'provider','farmalink','vendor_id',a.vendor_id,'attempt_id',a.attempt_id,'operation',p_operation,
   'cuir',v_cuir,'pdfPath',p_artifact_path,'issued_at',v_pdf->>'issuedAt','expires_at',v_pdf->>'expiresAt',
   'signature_method',p_signature_method));
  a.artifact_path:=p_artifact_path; v_action:='artifact_committed';
 END IF;
 INSERT INTO public.farmalink_operation_events(prescription_id,attempt_id,actor_user_id,action,evidence_sha256,artifact_path)
 VALUES(p.id,a.attempt_id,p_actor_user_id,v_action,p_artifact_sha256,p_artifact_path);
 RETURN jsonb_build_object('artifact_path',a.artifact_path,'cuir',v_cuir,'vendor_id',a.vendor_id,
  'issued_at',v_pdf->>'issuedAt','expires_at',v_pdf->>'expiresAt');
END;
$$;
REVOKE ALL ON FUNCTION public.complete_farmalink_artifact(uuid,uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_farmalink_artifact(uuid,uuid,uuid,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.list_farmalink_pending(p_actor_user_id uuid,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user <> 'service_role' OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_user_id
  AND active IS TRUE AND role IN ('admin','platform_admin')) THEN
  RAISE EXCEPTION 'farmalink_admin_required' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
  SELECT prescription_id,attempt_id,state,created_at,updated_at,(issue_snapshot IS NOT NULL) AS has_snapshot
  FROM public.farmalink_issue_attempts WHERE state IN ('reserved','unknown') ORDER BY created_at
  LIMIT greatest(1,least(coalesce(p_limit,100),100))) x);
END;
$$;
REVOKE ALL ON FUNCTION public.list_farmalink_pending(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_farmalink_pending(uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.get_farmalink_reconciliation_context(p_prescription_id uuid,p_actor_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.farmalink_issue_attempts%ROWTYPE;
BEGIN
 IF current_user <> 'service_role' OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_user_id
  AND active IS TRUE AND role IN ('admin','platform_admin')) THEN
  RAISE EXCEPTION 'farmalink_admin_required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.farmalink_issue_attempts WHERE prescription_id=p_prescription_id;
 IF NOT FOUND OR a.state NOT IN ('reserved','unknown') OR a.issue_snapshot IS NULL THEN
  RAISE EXCEPTION 'farmalink_not_reconcilable' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('attempt_id',a.attempt_id,'request_sha256',a.request_sha256,'snapshot',a.issue_snapshot);
END;
$$;
REVOKE ALL ON FUNCTION public.get_farmalink_reconciliation_context(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_farmalink_reconciliation_context(uuid,uuid) TO service_role;

ALTER TABLE public.farmalink_operation_events ADD COLUMN IF NOT EXISTS response_body text CHECK(response_body IS NULL OR octet_length(response_body)<=131072);
ALTER TABLE public.farmalink_operation_events ADD COLUMN IF NOT EXISTS response_sha256 text
 CHECK(response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$');
CREATE OR REPLACE FUNCTION public.reconcile_farmalink_issue(
 p_prescription_id uuid,p_attempt_id uuid,p_actor_user_id uuid,p_vendor_id text,
 p_request_sha256 text,p_evidence_sha256 text,p_response_sha256 text,p_provider_reference text,p_response_body text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.farmalink_issue_attempts%ROWTYPE;
BEGIN
 IF current_user <> 'service_role' OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_actor_user_id
  AND active IS TRUE AND role IN ('admin','platform_admin')) THEN
  RAISE EXCEPTION 'farmalink_admin_required' USING ERRCODE='42501'; END IF;
 IF p_vendor_id IS NULL OR p_vendor_id !~ '^[0-9]{1,32}$' OR p_evidence_sha256 IS NULL
  OR p_evidence_sha256 !~ '^[0-9a-f]{64}$' OR p_response_sha256 IS NULL OR p_response_sha256 !~ '^[0-9a-f]{64}$'
  OR p_response_body IS NULL OR octet_length(p_response_body)>131072
  OR encode(sha256(convert_to(p_response_body,'UTF8')),'hex') IS DISTINCT FROM p_response_sha256
  OR p_provider_reference IS NULL OR length(btrim(p_provider_reference)) NOT BETWEEN 3 AND 250 THEN
  RAISE EXCEPTION 'farmalink_invalid_reconciliation_evidence' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.prescriptions WHERE id=p_prescription_id AND country_code='AR' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'farmalink_not_reconcilable' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.farmalink_issue_attempts WHERE prescription_id=p_prescription_id
  AND attempt_id=p_attempt_id AND request_sha256=p_request_sha256 FOR UPDATE;
 IF NOT FOUND OR a.state NOT IN ('reserved','unknown') OR a.issue_snapshot IS NULL THEN RETURN false; END IF;
 -- Only the server's strict consulta comparison can invoke this RPC. No browser execution.
 UPDATE public.farmalink_issue_attempts SET state='confirmed',vendor_id=p_vendor_id,response_code='00',updated_at=now()
 WHERE prescription_id=p_prescription_id;
 INSERT INTO public.farmalink_operation_events(prescription_id,attempt_id,actor_user_id,action,evidence_sha256,response_sha256,provider_reference,response_body)
 VALUES(p_prescription_id,p_attempt_id,p_actor_user_id,'reconciled',p_evidence_sha256,p_response_sha256,btrim(p_provider_reference),p_response_body);
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_farmalink_issue(uuid,uuid,uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_farmalink_issue(uuid,uuid,uuid,text,text,text,text,text,text) TO service_role;
