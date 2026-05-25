-- Migration: 20260525080000_create_clinical_rule_evaluation_rpc.sql
-- Goal: Atomic transaction helper for rules evaluation, overrides, and outbox logs

CREATE OR REPLACE FUNCTION public.log_clinical_rule_evaluation_transaction(
  p_rule_version_id UUID,
  p_incident_id UUID,
  p_patient_id UUID,
  p_doctor_id UUID,
  p_evidence_used JSONB,
  p_recommendation TEXT,
  p_reason TEXT,
  p_override_reason TEXT DEFAULT NULL,
  p_authorized_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_execution_id UUID;
  v_override_id UUID := NULL;
  v_outbox_id UUID;
  v_event_type TEXT;
  v_payload JSONB;
BEGIN
  -- 1. Insert into executions log
  INSERT INTO public.clinical_rule_executions (
    rule_version_id,
    incident_id,
    patient_id,
    doctor_id,
    evidence_used,
    recommendation,
    reason
  ) VALUES (
    p_rule_version_id,
    p_incident_id,
    p_patient_id,
    p_doctor_id,
    p_evidence_used,
    p_recommendation,
    p_reason
  ) RETURNING id INTO v_execution_id;

  -- 2. If overridden, insert override log
  IF p_override_reason IS NOT NULL AND p_override_reason <> '' THEN
    INSERT INTO public.clinical_rule_overrides (
      execution_id,
      doctor_id,
      reason,
      authorized_by
    ) VALUES (
      v_execution_id,
      p_doctor_id,
      p_override_reason,
      p_authorized_by
    ) RETURNING id INTO v_override_id;
    
    v_event_type := 'safety_rule_overridden';
  ELSE
    v_event_type := 'safety_rule_evaluated';
  END IF;

  -- 3. Construct event payload for outbox
  v_payload := jsonb_build_object(
    'execution_id', v_execution_id,
    'rule_version_id', p_rule_version_id,
    'incident_id', p_incident_id,
    'patient_id', p_patient_id,
    'doctor_id', p_doctor_id,
    'evidence_used', p_evidence_used,
    'recommendation', p_recommendation,
    'reason', p_reason,
    'override_id', v_override_id,
    'override_reason', p_override_reason,
    'authorized_by', p_authorized_by
  );

  -- 4. Append to transactional outbox
  INSERT INTO public.clinical_outbox_events (
    event_type,
    payload,
    status
  ) VALUES (
    v_event_type,
    v_payload,
    'pending'
  ) RETURNING id INTO v_outbox_id;

  -- 5. Return success result
  RETURN jsonb_build_object(
    'success', true,
    'execution_id', v_execution_id,
    'override_id', v_override_id,
    'outbox_id', v_outbox_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Clinical Safety Transaction failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

-- Grant EXECUTE permission to authenticated users
GRANT EXECUTE ON FUNCTION public.log_clinical_rule_evaluation_transaction(UUID, UUID, UUID, UUID, JSONB, TEXT, TEXT, TEXT, UUID) TO authenticated;
