-- A doctor may acknowledge only their own-country pending triage case,
-- and only after the same clinical approval gate used by dispatch.
CREATE OR REPLACE FUNCTION public.take_triage_case(p_case_state_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_doctor_id uuid;
  v_doctor_country text;
  v_updated_count integer;
BEGIN
  SELECT d.id,d.care_country
    INTO v_doctor_id,v_doctor_country
  FROM public.doctors d
  WHERE d.user_id=(SELECT auth.uid())
    AND d.active IS TRUE
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_doctor_id IS NULL
     OR NOT app_private.is_doctor_dispatch_approved(v_doctor_id) THEN
    RAISE EXCEPTION 'doctor_not_clinically_approved' USING ERRCODE='42501';
  END IF;

  UPDATE public.clinical_case_states c
  SET assigned_doctor_id=v_doctor_id,
      triage_status='acknowledged',
      acknowledged_at=pg_catalog.now(),
      updated_at=pg_catalog.now()
  FROM public.patients p
  WHERE c.id=p_case_state_id
    AND p.id=c.patient_id
    AND p.care_country=v_doctor_country
    AND c.triage_status='pending'
    AND (c.assigned_doctor_id IS NULL OR c.assigned_doctor_id=v_doctor_id);

  GET DIAGNOSTICS v_updated_count=ROW_COUNT;
  IF v_updated_count=0 THEN
    RAISE EXCEPTION 'triage_case_unavailable_or_country_mismatch' USING ERRCODE='42501';
  END IF;
END;
$function$;
