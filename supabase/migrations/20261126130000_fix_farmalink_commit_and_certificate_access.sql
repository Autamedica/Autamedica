-- Prepared only. Do not apply to production without independent release validation.
-- Fixes AR Farmalink initial/recovery commit state and electronic medical certificate access/validation.

BEGIN;

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
 AND pr.active IS TRUE AND pr.role='doctor' AND pr.sss_validation_status = 'valid' AND p.country_code='AR' AND p.status IN ('draft','active','sent');
 IF NOT FOUND THEN RAISE EXCEPTION 'farmalink_recovery_forbidden' USING ERRCODE='42501'; END IF;
 IF a.state <> 'confirmed' OR a.vendor_id IS NULL OR a.vendor_id !~ '^[0-9]{1,32}$' OR a.issue_snapshot IS NULL OR a.response_code IS NULL OR a.response_code NOT IN ('00','0') THEN
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
 AND p.country_code='AR' AND pr.active IS TRUE AND pr.role='doctor' AND pr.sss_validation_status = 'valid'
 AND pt.active IS TRUE AND pt.care_country='AR' FOR UPDATE OF x;
 IF NOT FOUND OR a.state <> 'confirmed' OR a.vendor_id IS NULL OR a.vendor_id !~ '^[0-9]{1,32}$' OR a.issue_snapshot IS NULL OR a.response_code IS NULL OR a.response_code NOT IN ('00','0') THEN
  RAISE EXCEPTION 'farmalink_recovery_forbidden' USING ERRCODE='42501'; END IF;
 IF p.status NOT IN ('draft','active','sent') OR (a.artifact_path IS NULL AND p.status NOT IN ('draft','active')) THEN
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
  UPDATE public.prescriptions SET cuir=v_cuir,status='active',vendor_name='farmalink',vendor_id=a.vendor_id,
   qr_code_content='https://www.autamedica.com/verify/'||v_cuir,
   signature_method=p_signature_method,signed_pdf_url=p_signed_pdf_url,
   pdf_sha256=COALESCE(p_artifact_sha256, pdf_sha256),
   pdf_storage_path=COALESCE(p_artifact_path, pdf_storage_path),
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
   'cuir',v_cuir,'pdfPath',p_artifact_path,'signature_hash',p_artifact_sha256,
   'issued_at',v_pdf->>'issuedAt','expires_at',v_pdf->>'expiresAt',
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

CREATE OR REPLACE FUNCTION public.issue_electronic_medical_certificate(
  p_certificate_id uuid, p_actor_user_id uuid,
  p_expected_certificate jsonb, p_expected_doctor jsonb, p_expected_profile jsonb,
  p_expected_patient jsonb, p_expected_patient_profile jsonb,
  p_snapshot_hash text, p_pdf_hash text, p_signature_hash text, p_stamp_hash text,
  p_confirmed_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  c public.medical_certificates%ROWTYPE;
  d public.doctors%ROWTYPE;
  pr public.profiles%ROWTYPE;
  pat public.patients%ROWTYPE;
  pp public.profiles%ROWTYPE;
  pi public.patient_private_identities%ROWTYPE;
  v_patient_full_name text;
  v_patient_dni text;
  v_expected_patient_compare jsonb;
  v_expected_profile_compare jsonb;
  path text;
BEGIN
  SELECT * INTO c FROM public.medical_certificates WHERE id = p_certificate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'certificate_missing'; END IF;
  SELECT * INTO d FROM public.doctors WHERE id = c.doctor_id FOR SHARE;
  IF NOT FOUND OR d.user_id IS DISTINCT FROM p_actor_user_id THEN RAISE EXCEPTION 'certificate_not_owned'; END IF;
  IF c.status = 'signed' AND EXISTS (
    SELECT 1 FROM public.medical_certificate_electronic_issuances e
    WHERE e.certificate_id = c.id AND e.actor_user_id = p_actor_user_id
  ) THEN RETURN to_jsonb(c); END IF;
  IF c.status <> 'draft' OR c.country_code <> 'AR' OR d.license_type NOT IN ('MN','MP') OR d.active IS NOT TRUE THEN
    RAISE EXCEPTION 'certificate_not_eligible';
  END IF;
  SELECT * INTO pr FROM public.profiles WHERE user_id = p_actor_user_id FOR SHARE;
  IF NOT FOUND OR pr.role::text <> 'doctor' OR pr.active IS NOT TRUE OR pr.deleted_at IS NOT NULL
     OR COALESCE(pr.sss_validation_status, '') NOT IN ('valid', 'exempt') THEN
    RAISE EXCEPTION 'certificate_doctor_not_validated';
  END IF;
  SELECT * INTO pat FROM public.patients WHERE id = c.patient_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'certificate_patient_missing'; END IF;

  IF pat.user_id IS NOT NULL THEN
    SELECT * INTO pp FROM public.profiles WHERE user_id = pat.user_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'certificate_identity_or_assets_incomplete';
    END IF;
    v_patient_full_name := btrim(concat_ws(' ', pp.first_name, pp.last_name));
    v_patient_dni := btrim(coalesce(pat.dni, ''));
    v_expected_patient_compare := to_jsonb(pat);
    v_expected_profile_compare := to_jsonb(pp);
  ELSE
    SELECT * INTO pi FROM public.patient_private_identities
      WHERE patient_id = pat.id AND doctor_id = d.id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'certificate_identity_or_assets_incomplete';
    END IF;
    v_patient_full_name := btrim(coalesce(pi.full_name, ''));
    v_patient_dni := btrim(coalesce(pat.dni, pi.document_number, ''));
    v_expected_patient_compare := to_jsonb(pat) || jsonb_build_object('dni', v_patient_dni);
    v_expected_profile_compare := jsonb_build_object('user_id', null, 'first_name', pi.full_name, 'last_name', '');
  END IF;

  IF nullif(v_patient_full_name, '') IS NULL
     OR nullif(v_patient_dni, '') IS NULL
     OR nullif(btrim(d.license_number), '') IS NULL
     OR nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '') IS NULL
     OR coalesce(nullif(d.signature_image_url, ''), nullif(d.signature_url, '')) IS NULL
     OR coalesce(nullif(d.stamp_image_url, ''), nullif(d.stamp_url, '')) IS NULL THEN
    RAISE EXCEPTION 'certificate_identity_or_assets_incomplete';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.patient_care_team t WHERE t.doctor_id = d.id AND t.patient_id = pat.id AND t.active)
     AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.doctor_id = d.id AND a.patient_id = pat.id)
     AND NOT EXISTS (SELECT 1 FROM public.doctor_patient dp WHERE dp.doctor_id = d.id AND dp.patient_id = pat.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.pharmacy_dispatch_requests pdr
       WHERE pdr.assigned_doctor_id = d.id AND pdr.patient_id = pat.id
         AND pdr.status IN ('matched', 'in_call', 'transferring', 'transferred', 'completed')
     ) THEN
    RAISE EXCEPTION 'certificate_patient_access_denied';
  END IF;
  IF c.appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments a WHERE a.id = c.appointment_id AND a.doctor_id = d.id AND a.patient_id = pat.id
  ) THEN RAISE EXCEPTION 'certificate_appointment_mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM public.medical_certificate_signature_requests r WHERE r.certificate_id = c.id
    AND r.status IN ('pending','awaiting_doctor_authorization','processing') AND r.expires_at > now()) THEN
    RAISE EXCEPTION 'certificate_remote_signing_in_progress';
  END IF;
  IF p_expected_certificate IS DISTINCT FROM to_jsonb(c)
     OR p_expected_doctor IS NULL OR NOT (to_jsonb(d) @> p_expected_doctor)
     OR p_expected_profile IS NULL OR NOT (to_jsonb(pr) @> p_expected_profile)
     OR p_expected_patient IS NULL OR NOT (v_expected_patient_compare @> p_expected_patient)
     OR p_expected_patient_profile IS NULL OR NOT (v_expected_profile_compare @> p_expected_patient_profile) THEN
    RAISE EXCEPTION 'certificate_snapshot_changed';
  END IF;
  IF c.days_of_rest < 0 OR c.days_of_rest > 365 OR (c.days_of_rest > 0 AND (
    c.end_date IS DISTINCT FROM c.start_date + c.days_of_rest - 1 OR nullif(btrim(c.diagnosis),'') IS NULL
  )) THEN RAISE EXCEPTION 'certificate_period_invalid'; END IF;
  IF coalesce(p_snapshot_hash,'') !~ '^[a-f0-9]{64}$' OR coalesce(p_pdf_hash,'') !~ '^[a-f0-9]{64}$'
     OR coalesce(p_signature_hash,'') !~ '^[a-f0-9]{64}$' OR coalesce(p_stamp_hash,'') !~ '^[a-f0-9]{64}$'
     OR p_confirmed_at IS NULL OR p_confirmed_at < now() - interval '5 minutes'
     OR p_confirmed_at > now() + interval '1 minute' THEN RAISE EXCEPTION 'certificate_evidence_invalid'; END IF;
  path := 'certificates/electronic/' || c.id::text || '/' || p_pdf_hash || '.pdf';
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'medical-documents' AND name = path) THEN
    RAISE EXCEPTION 'certificate_pdf_missing';
  END IF;
  INSERT INTO public.medical_certificate_electronic_issuances (
    certificate_id,actor_user_id,confirmed_at,snapshot_hash,pdf_hash,signature_image_hash,stamp_image_hash,pdf_path,doctor_identity
  ) VALUES (c.id,p_actor_user_id,p_confirmed_at,p_snapshot_hash,p_pdf_hash,p_signature_hash,p_stamp_hash,path,
    jsonb_build_object('name',concat_ws(' ',pr.first_name,pr.last_name),'license',d.license_number,'license_type',d.license_type));
  UPDATE public.medical_certificates SET status = 'signed', signature_method = 'electronic_verified',
    signature_hash = p_pdf_hash, signed_pdf_url = path, signature_verified_at = p_confirmed_at, updated_at = now()
    WHERE id = c.id RETURNING * INTO c;
  RETURN to_jsonb(c);
END;
$$;

COMMIT;
