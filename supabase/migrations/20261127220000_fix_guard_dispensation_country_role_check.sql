-- Fix SECURITY DEFINER role check in app_private.guard_dispensation_country().
-- Inside a SECURITY DEFINER trigger function, current_user is the function owner
-- ('postgres'), so checking `current_user IN ('anon', 'authenticated')` never matched.
-- Inspect the PostgREST GUC `request.jwt.claim.role` instead.

CREATE OR REPLACE FUNCTION app_private.guard_dispensation_country()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rx record;
  v_doctor_country text;
  v_patient_country text;
  v_pharmacy_country text;
  v_total bigint;
BEGIN
  IF TG_OP='UPDATE' AND OLD.care_country IS NULL THEN
    RAISE EXCEPTION 'dispensation_historical_country_quarantined' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM public.dispensation_orders o WHERE o.prescription_id=NEW.prescription_id AND o.care_country IS NULL) THEN
    RAISE EXCEPTION 'dispensation_legacy_prescription_requires_reconciliation' USING ERRCODE='23514';
  END IF;
  SELECT p.country_code, p.patient_id, p.doctor_id
    INTO v_rx FROM public.prescriptions p WHERE p.id = NEW.prescription_id;
  IF NOT FOUND OR v_rx.country_code NOT IN ('AR','BR') THEN
    RAISE EXCEPTION 'dispensation_valid_country_prescription_required' USING ERRCODE = '23514';
  END IF;
  -- Never let a pharmacy change the Rx/clinician/patient association on an existing order.
  IF TG_OP = 'UPDATE'
     AND (NEW.prescription_id IS DISTINCT FROM OLD.prescription_id
       OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id) THEN
    RAISE EXCEPTION 'dispensation_order_clinical_identity_immutable' USING ERRCODE = '23514';
  END IF;

  IF TG_OP='INSERT' AND coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') IN ('anon','authenticated') AND (auth.uid() IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.doctors acting JOIN public.profiles pr ON pr.user_id=acting.user_id
    WHERE acting.id=NEW.doctor_id AND acting.user_id=auth.uid() AND acting.active AND pr.active AND pr.role::text='doctor')) THEN
    RAISE EXCEPTION 'dispensation_order_prescriber_session_required' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' AND (NEW.prescriber_verified IS DISTINCT FROM false
       OR NEW.reconciliation_status IS DISTINCT FROM 'pending'
       OR NEW.clinician_decision IS DISTINCT FROM 'under_review'
       OR NEW.status NOT IN ('pending','blocked')) THEN
    RAISE EXCEPTION 'dispensation_initial_clinical_attestation_forbidden' USING ERRCODE='42501';
  END IF;

  -- Clinical facts may be attested/reconciled only by the actual physician who
  -- issued this Rx with a verified user session. service_role impersonation and
  -- pharmacy credential holders cannot elevate clinical verification flags.
  IF TG_OP = 'UPDATE' AND (
      NEW.prescriber_verified IS DISTINCT FROM OLD.prescriber_verified
      OR NEW.reconciliation_status IS DISTINCT FROM OLD.reconciliation_status
      OR NEW.clinician_decision IS DISTINCT FROM OLD.clinician_decision
      OR NEW.medication IS DISTINCT FROM OLD.medication
      OR NEW.formulation IS DISTINCT FROM OLD.formulation
      OR NEW.dose_mg_per_day IS DISTINCT FROM OLD.dose_mg_per_day
      OR NEW.quantity_units IS DISTINCT FROM OLD.quantity_units
      OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
      OR NEW.dispense_window_start IS DISTINCT FROM OLD.dispense_window_start
      OR NEW.dispense_window_end IS DISTINCT FROM OLD.dispense_window_end
      OR NEW.extraordinary_dose_flag IS DISTINCT FROM OLD.extraordinary_dose_flag
      OR NEW.clinical_semaphore IS DISTINCT FROM OLD.clinical_semaphore
      OR NEW.prescription_type IS DISTINCT FROM OLD.prescription_type
      OR NEW.requires_clarification IS DISTINCT FROM OLD.requires_clarification
      OR NEW.prescriber_notes IS DISTINCT FROM OLD.prescriber_notes
      OR NEW.semaphore_reasons IS DISTINCT FROM OLD.semaphore_reasons
    ) AND (
      auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.doctors acting
        WHERE acting.id = OLD.doctor_id AND acting.user_id = auth.uid()
          AND acting.active = true AND acting.care_country = OLD.care_country
      )
    ) THEN
    RAISE EXCEPTION 'dispensation_clinical_fields_prescriber_only' USING ERRCODE = '42501';
  END IF;

  IF NEW.doctor_id IS DISTINCT FROM v_rx.doctor_id
     OR NEW.patient_id IS DISTINCT FROM v_rx.patient_id THEN
    RAISE EXCEPTION 'dispensation_prescription_identity_mismatch' USING ERRCODE = '23514';
  END IF;
  -- Imported directory entries without a linked physician account are not prescribers.
  SELECT d.care_country INTO v_doctor_country FROM public.doctors d
  JOIN public.profiles profile ON profile.user_id=d.user_id
    AND profile.role='doctor' AND profile.active
  WHERE d.id = v_rx.doctor_id AND d.active AND d.user_id IS NOT NULL;
  SELECT p.care_country INTO v_patient_country FROM public.patients p WHERE p.id = v_rx.patient_id AND p.active;
  IF v_doctor_country IS DISTINCT FROM v_rx.country_code
     OR v_patient_country IS DISTINCT FROM v_rx.country_code THEN
    RAISE EXCEPTION 'dispensation_doctor_patient_country_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.care_country IS NOT NULL AND NEW.care_country <> v_rx.country_code THEN
    RAISE EXCEPTION 'dispensation_order_country_mismatch' USING ERRCODE = '23514';
  END IF;
  NEW.care_country := v_rx.country_code;

  IF NEW.pharmacy_id IS NOT NULL THEN
    SELECT p.care_country INTO v_pharmacy_country FROM public.pharmacies p
    WHERE p.id = NEW.pharmacy_id AND p.active AND p.deleted_at IS NULL;
    IF v_pharmacy_country IS DISTINCT FROM v_rx.country_code THEN
      RAISE EXCEPTION 'dispensation_pharmacy_country_mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP='UPDATE' AND OLD.pharmacy_id IS NOT NULL
     AND NEW.pharmacy_id IS DISTINCT FROM OLD.pharmacy_id THEN
    RAISE EXCEPTION 'dispensation_claim_immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.pharmacy_id IS DISTINCT FROM OLD.pharmacy_id
    ) AND NEW.status IN ('assigned','under_review','clarification_requested',
                         'approved_for_dispensation','partially_dispensed','dispensed') THEN
    IF NOT app_private.pharmacy_actor_authorized(NEW.pharmacy_id,NEW.care_country) THEN
      RAISE EXCEPTION 'dispensation_actor_not_authorized' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status='pending' AND NEW.status IN ('assigned','blocked','cancelled','expired')) OR
      (OLD.status='assigned' AND NEW.status IN ('under_review','blocked','cancelled','expired')) OR
      (OLD.status='under_review' AND NEW.status IN ('approved_for_dispensation','clarification_requested','blocked','cancelled','expired')) OR
      (OLD.status='blocked' AND NEW.status IN ('clarification_requested','cancelled','expired')) OR
      (OLD.status='clarification_requested' AND NEW.status IN ('clarification_provided','cancelled','expired')) OR
      (OLD.status='clarification_provided' AND NEW.status IN ('under_review','approved_for_dispensation','blocked','cancelled','expired')) OR
      (OLD.status IN ('approved_for_dispensation','partially_dispensed') AND NEW.status IN ('partially_dispensed','dispensed','blocked','cancelled','expired'))
    ) THEN RAISE EXCEPTION 'dispensation_invalid_state_transition' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.status IN ('approved_for_dispensation','partially_dispensed','dispensed') THEN
    IF NEW.pharmacy_id IS NULL OR NEW.prescriber_verified IS DISTINCT FROM true
       OR NEW.reconciliation_status IS DISTINCT FROM 'reconciled'
       OR NEW.clinician_decision IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'dispensation_clinical_verification_required' USING ERRCODE = '23514';
    END IF;
    IF NOT app_private.pharmacy_release_evidence_matches(NEW.id) THEN
      RAISE EXCEPTION 'dispensation_verified_signature_evidence_required' USING ERRCODE='23514';
    END IF;
    IF NEW.status='approved_for_dispensation' AND NOT app_private.pharmacy_required_validations_passed(NEW.id) THEN
      RAISE EXCEPTION 'dispensation_required_validations_incomplete' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(e.dispensed_quantity),0) INTO v_total
      FROM public.dispensation_events e WHERE e.order_id=NEW.id;
    IF (NEW.status='dispensed' AND v_total<>NEW.quantity_units)
       OR (NEW.status='partially_dispensed' AND NOT(v_total>0 AND v_total<NEW.quantity_units)) THEN
      RAISE EXCEPTION 'dispensation_state_requires_delivery_events' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='UPDATE' AND EXISTS (SELECT 1 FROM public.dispensation_events e WHERE e.order_id=OLD.id)
     AND (NEW.medication,NEW.formulation,NEW.quantity_units,NEW.dose_mg_per_day,NEW.duration_days,
          NEW.prescription_type,NEW.dispense_window_start,NEW.dispense_window_end)
       IS DISTINCT FROM (OLD.medication,OLD.formulation,OLD.quantity_units,OLD.dose_mg_per_day,OLD.duration_days,
          OLD.prescription_type,OLD.dispense_window_start,OLD.dispense_window_end) THEN
    RAISE EXCEPTION 'dispensation_delivered_clinical_snapshot_immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION app_private.guard_dispensation_country() FROM PUBLIC, anon, authenticated;
