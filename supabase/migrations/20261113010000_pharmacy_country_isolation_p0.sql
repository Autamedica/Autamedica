-- P0: new AR/BR dispensing is isolated; existing rows remain unclassified and frozen.
-- No historical jurisdiction, clinical field, status or signature is backfilled.
ALTER TABLE public.pharmacies
  ADD COLUMN care_country text CONSTRAINT pharmacies_care_country_check CHECK (care_country IN ('AR','BR'));
ALTER TABLE public.pharmacists
  ADD COLUMN care_country text CONSTRAINT pharmacists_care_country_check CHECK (care_country IN ('AR','BR'));
ALTER TABLE public.dispensation_orders
  ADD COLUMN care_country text CONSTRAINT dispensation_orders_care_country_check CHECK (care_country IN ('AR','BR'));

COMMENT ON COLUMN public.pharmacies.care_country IS 'Required licensed jurisdiction of this dispensing pharmacy (AR/BR).';
COMMENT ON COLUMN public.pharmacists.care_country IS 'Enforced server-side from the assigned pharmacy, never caller-controlled.';
COMMENT ON COLUMN public.dispensation_orders.care_country IS 'Enforced server-side from prescription.country_code and clinical doctor/patient jurisdiction.';

-- Empty by design until a separately authorized verifier is connected. This is
-- an evidence ledger, not an assertion that a URL/hash/status verifies a signature.
-- A verifier must independently check exact PDF bytes, certificate chain,
-- revocation, signer identity and provider authorization before writing here.
CREATE TABLE app_private.pharmacy_prescription_release_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL UNIQUE REFERENCES public.prescriptions(id),
  order_snapshot jsonb NOT NULL,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  care_country text NOT NULL CHECK (care_country IN ('AR','BR')),
  clinical_snapshot jsonb NOT NULL,
  signed_pdf_url text NOT NULL CHECK (NULLIF(btrim(signed_pdf_url),'') IS NOT NULL),
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[a-f0-9]{64}$'),
  certificate_sha256 text NOT NULL CHECK (certificate_sha256 ~ '^[a-f0-9]{64}$'),
  verifier_reference text NOT NULL CHECK (NULLIF(btrim(verifier_reference),'') IS NOT NULL),
  provider_authorization_reference text NOT NULL CHECK (NULLIF(btrim(provider_authorization_reference),'') IS NOT NULL),
  verified_at timestamptz NOT NULL CHECK (verified_at <= now()),
  revoked_at timestamptz
);
ALTER TABLE app_private.pharmacy_prescription_release_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_private.pharmacy_prescription_release_evidence FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE app_private.pharmacy_prescription_release_evidence IS
  'Verifier-only evidence boundary; no application writer granted. Empty means real dispensing disabled. External certification and verifier must be independently established before granting writes.';

CREATE FUNCTION app_private.pharmacy_actor_authorized(p_pharmacy uuid,p_country text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.pharmacists ph
   JOIN public.profiles pr ON pr.user_id=ph.user_id AND pr.active AND pr.role::text='pharmacist'
   JOIN public.pharmacies f ON f.id=ph.pharmacy_id AND f.active AND f.deleted_at IS NULL
   WHERE ph.user_id=auth.uid() AND ph.active AND ph.pharmacy_id=p_pharmacy
     AND ph.care_country=p_country AND f.care_country=p_country
     AND ph.role IN ('pharmacist','pharmacy_director')
     AND NULLIF(btrim(ph.license_number),'') IS NOT NULL
 );
$$;
REVOKE ALL ON FUNCTION app_private.pharmacy_actor_authorized(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.pharmacy_actor_authorized(uuid,text) TO authenticated;

CREATE FUNCTION app_private.pharmacy_release_evidence_matches(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.dispensation_orders o JOIN public.prescriptions rx ON rx.id=o.prescription_id
   JOIN app_private.pharmacy_prescription_release_evidence e
     ON e.prescription_id=rx.id AND e.revoked_at IS NULL
     AND e.doctor_id=rx.doctor_id AND e.patient_id=rx.patient_id
     AND e.care_country=rx.country_code AND e.clinical_snapshot=rx.clinical_data
     AND e.signed_pdf_url=rx.signed_pdf_url
     AND e.order_snapshot=jsonb_build_object('medication',o.medication,'formulation',o.formulation,
       'dose_mg_per_day',o.dose_mg_per_day,'quantity_units',o.quantity_units,'duration_days',o.duration_days,
       'prescription_type',o.prescription_type,'dispense_window_start',o.dispense_window_start,'dispense_window_end',o.dispense_window_end)
   WHERE o.id=p_order AND rx.status IN ('signed','sent','dispensed_partial','dispensed_total')
 );
$$;
REVOKE ALL ON FUNCTION app_private.pharmacy_release_evidence_matches(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION app_private.pharmacy_required_validations_passed(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 WITH required AS (
   SELECT unnest(ARRAY['patient_identity','prescriber_identity','medication_match',
     'formulation_match','quantity_check','validity_check'] ||
     CASE WHEN o.extraordinary_dose_flag THEN ARRAY['dose_check'] ELSE ARRAY[]::text[] END ||
     CASE WHEN o.prescription_type='transition_bridge' THEN ARRAY['bridge_protocol'] ELSE ARRAY[]::text[] END ||
     CASE WHEN rx.is_controlled_substance IS TRUE OR
       lower(o.medication) ~ '(metilfenidato|methylphenidate|lisdexanfetamina|anfetamina|modafinilo|atomoxetina)'
       THEN ARRAY['controlled_substance'] ELSE ARRAY[]::text[] END) AS kind
   FROM public.dispensation_orders o JOIN public.prescriptions rx ON rx.id=o.prescription_id WHERE o.id=p_order
 ), latest AS (
   SELECT DISTINCT ON (v.validation_type) v.validation_type,v.result
   FROM public.dispensation_validations v WHERE v.order_id=p_order
   ORDER BY v.validation_type,v.created_at DESC,v.id DESC
 )
 SELECT EXISTS(SELECT 1 FROM required) AND NOT EXISTS (
   SELECT 1 FROM required r LEFT JOIN latest l ON l.validation_type=r.kind
   WHERE l.result IS NULL OR l.result NOT IN ('pass','overridden')
 );
$$;
REVOKE ALL ON FUNCTION app_private.pharmacy_required_validations_passed(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Enum gained pharmacist in April, but the baseline profile CHECK did not.
-- Extend its existing expression without removing other role restrictions.
DO $profile_role$
DECLARE v_expression text;
BEGIN
  SELECT pg_get_expr(conbin,conrelid) INTO v_expression FROM pg_constraint
    WHERE conrelid='public.profiles'::regclass AND conname='chk_profiles_role';
  IF v_expression IS NOT NULL THEN
    ALTER TABLE public.profiles DROP CONSTRAINT chk_profiles_role;
    EXECUTE format('ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_role CHECK ((%s) OR role::text=%L)',v_expression,'pharmacist');
  END IF;
END $profile_role$;

-- Never default to clinically verified or reconciled merely on order insertion.
ALTER TABLE public.dispensation_orders
  ALTER COLUMN prescriber_verified SET DEFAULT false,
  ALTER COLUMN reconciliation_status SET DEFAULT 'pending',
  ALTER COLUMN clinician_decision SET DEFAULT 'under_review';

CREATE OR REPLACE FUNCTION app_private.guard_pharmacy_country()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.care_country IS NULL THEN
    RAISE EXCEPTION 'pharmacy_country_required_or_historical_quarantined' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.care_country IS DISTINCT FROM OLD.care_country THEN
    RAISE EXCEPTION 'pharmacy_country_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_pharmacy_country
BEFORE INSERT OR UPDATE ON public.pharmacies
FOR EACH ROW EXECUTE FUNCTION app_private.guard_pharmacy_country();

CREATE OR REPLACE FUNCTION app_private.guard_pharmacist_country()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_country text;
BEGIN
  IF TG_OP='UPDATE' AND OLD.care_country IS NULL THEN
    RAISE EXCEPTION 'pharmacist_historical_country_quarantined' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.care_country IS DISTINCT FROM OLD.care_country
       OR NEW.pharmacy_id IS DISTINCT FROM OLD.pharmacy_id) THEN
    RAISE EXCEPTION 'pharmacist_assignment_requires_reenrollment' USING ERRCODE = '23514';
  END IF;
  IF NEW.pharmacy_id IS NULL THEN
    RAISE EXCEPTION 'pharmacist_pharmacy_required' USING ERRCODE = '23514';
  END IF;
  SELECT p.care_country INTO v_country FROM public.pharmacies p
  WHERE p.id = NEW.pharmacy_id AND p.active AND p.deleted_at IS NULL;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'pharmacist_pharmacy_inactive_or_unknown' USING ERRCODE = '23514';
  END IF;
  IF NEW.care_country IS NOT NULL AND NEW.care_country <> v_country THEN
    RAISE EXCEPTION 'pharmacist_country_mismatch' USING ERRCODE = '23514';
  END IF;
  NEW.care_country := v_country;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_pharmacist_country
BEFORE INSERT OR UPDATE ON public.pharmacists
FOR EACH ROW EXECUTE FUNCTION app_private.guard_pharmacist_country();

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

  IF TG_OP='INSERT' AND (auth.uid() IS NULL OR NOT EXISTS(
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

CREATE TRIGGER zz_dispensation_country
BEFORE INSERT OR UPDATE ON public.dispensation_orders
FOR EACH ROW EXECUTE FUNCTION app_private.guard_dispensation_country();

CREATE FUNCTION app_private.pharmacy_order_context_aligned(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(
  SELECT 1 FROM public.dispensation_orders o JOIN public.prescriptions rx ON rx.id=o.prescription_id
    AND rx.country_code=o.care_country AND rx.doctor_id=o.doctor_id AND rx.patient_id=o.patient_id
  JOIN public.doctors d ON d.id=o.doctor_id AND d.active AND d.user_id IS NOT NULL AND d.care_country=o.care_country
  JOIN public.profiles pr ON pr.user_id=d.user_id AND pr.active AND pr.role::text='doctor'
  JOIN public.patients p ON p.id=o.patient_id AND p.active AND p.care_country=o.care_country
  JOIN public.pharmacies f ON f.id=o.pharmacy_id AND f.active AND f.deleted_at IS NULL AND f.care_country=o.care_country
  WHERE o.id=p_order
) $$;
REVOKE ALL ON FUNCTION app_private.pharmacy_order_context_aligned(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION app_private.guard_dispensation_pharmacist_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_country text;
  v_order_pharmacy uuid;
  v_pharmacist_country text;
  v_pharmacist_pharmacy uuid;
BEGIN
  SELECT o.care_country,o.pharmacy_id INTO v_order_country,v_order_pharmacy
  FROM public.dispensation_orders o WHERE o.id=NEW.order_id;
  SELECT ph.care_country, ph.pharmacy_id INTO v_pharmacist_country, v_pharmacist_pharmacy
  FROM public.pharmacists ph
  WHERE ph.id = NEW.pharmacist_id AND ph.active
    AND ph.role IN ('pharmacist','pharmacy_director')
    AND NULLIF(btrim(ph.license_number),'') IS NOT NULL;
  IF v_order_pharmacy IS NULL OR v_pharmacist_pharmacy IS NULL
     OR NOT app_private.pharmacy_order_context_aligned(NEW.order_id)
     OR v_order_pharmacy IS DISTINCT FROM v_pharmacist_pharmacy
     OR v_order_country IS DISTINCT FROM v_pharmacist_country THEN
    RAISE EXCEPTION 'dispensation_event_pharmacy_country_mismatch' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pharmacists ph
     WHERE ph.id=NEW.pharmacist_id AND ph.user_id=auth.uid())
     OR NOT app_private.pharmacy_actor_authorized(v_order_pharmacy,v_order_country) THEN
    RAISE EXCEPTION 'dispensation_event_actor_not_authorized' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME = 'dispensation_validations' THEN
    IF NOT EXISTS(SELECT 1 FROM public.dispensation_orders o WHERE o.id=NEW.order_id
      AND o.status IN ('assigned','under_review','clarification_provided')) THEN
      RAISE EXCEPTION 'dispensation_order_not_validatable' USING ERRCODE='23514';
    END IF;
  IF NEW.result='overridden' AND NOT EXISTS (
    SELECT 1 FROM public.pharmacists ph WHERE ph.id=NEW.pharmacist_id
      AND ph.role='pharmacy_director' AND NEW.override_authorized_by=ph.id
      AND NULLIF(btrim(NEW.override_reason),'') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'dispensation_override_director_required' USING ERRCODE='42501';
  END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_dispensation_validations_country
BEFORE INSERT OR UPDATE ON public.dispensation_validations
FOR EACH ROW EXECUTE FUNCTION app_private.guard_dispensation_pharmacist_event();

CREATE TRIGGER zz_dispensation_events_country
BEFORE INSERT OR UPDATE ON public.dispensation_events
FOR EACH ROW EXECUTE FUNCTION app_private.guard_dispensation_pharmacist_event();

-- A clarification is clinical data. It must be created by a licensed
-- pharmacist at the matching, assigned pharmacy, even through service_role.
CREATE OR REPLACE FUNCTION app_private.guard_dispensation_clarification_country()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.order_id,NEW.requested_by,NEW.question,NEW.question_category,NEW.requested_at,NEW.expires_at)
       IS DISTINCT FROM (OLD.order_id,OLD.requested_by,OLD.question,OLD.question_category,OLD.requested_at,OLD.expires_at) THEN
      RAISE EXCEPTION 'dispensation_clarification_request_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.status<>'responded' OR OLD.status<>'pending' OR OLD.expires_at<=now()
       OR NEW.responded_by IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL
       OR NULLIF(btrim(NEW.response),'') IS NULL OR NEW.response_decision IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.dispensation_orders o JOIN public.doctors d ON d.id=o.doctor_id
         JOIN public.profiles pr ON pr.user_id=d.user_id AND pr.active AND pr.role::text='doctor'
         WHERE o.id=NEW.order_id AND d.user_id=auth.uid() AND d.active AND d.care_country=o.care_country
       ) THEN
      RAISE EXCEPTION 'dispensation_clarification_prescriber_response_required' USING ERRCODE='42501';
    END IF;
    NEW.responded_at:=now();
    RETURN NEW;
  END IF;
  IF NEW.requested_by IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL
     OR NEW.status<>'pending' OR NEW.response IS NOT NULL OR NEW.responded_by IS NOT NULL
     OR NEW.response_decision IS NOT NULL OR COALESCE(NEW.modified_fields,'{}'::jsonb)<>'{}'::jsonb THEN
    RAISE EXCEPTION 'dispensation_clarification_request_actor_required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dispensation_orders o WHERE o.id=NEW.order_id
      AND app_private.pharmacy_order_context_aligned(o.id)
      AND app_private.pharmacy_actor_authorized(o.pharmacy_id,o.care_country)
  ) THEN
    RAISE EXCEPTION 'dispensation_clarification_country_or_actor_mismatch' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM public.dispensation_orders WHERE id=NEW.order_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.dispensation_clarifications WHERE order_id=NEW.order_id AND status='pending') THEN
    RAISE EXCEPTION 'dispensation_clarification_already_pending' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_dispensation_clarifications_country
BEFORE INSERT OR UPDATE ON public.dispensation_clarifications
FOR EACH ROW EXECUTE FUNCTION app_private.guard_dispensation_clarification_country();

-- Prevent browsing establishments in the other country through generic authenticated SELECT.
ALTER POLICY pharmacies_select_authenticated ON public.pharmacies
USING (
  active AND deleted_at IS NULL AND (
    public.is_system_admin()
    OR pharmacies.id IN (SELECT public.current_pharmacist_pharmacy_ids())
    OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.user_id=auth.uid() AND d.active AND d.care_country=pharmacies.care_country)
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.user_id=auth.uid() AND p.active AND p.care_country=pharmacies.care_country)
  )
);



-- Once a structured dispensing order exists, do not reclassify its source Rx.
CREATE OR REPLACE FUNCTION app_private.guard_prescription_country_with_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.country_code, NEW.patient_id, NEW.doctor_id)
     IS DISTINCT FROM (OLD.country_code, OLD.patient_id, OLD.doctor_id)
     AND EXISTS (SELECT 1 FROM public.dispensation_orders o WHERE o.prescription_id=OLD.id)
  THEN
    RAISE EXCEPTION 'prescription_country_or_participants_locked_by_dispensation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER zz_prescription_dispensation_country_lock
BEFORE UPDATE OF country_code, patient_id, doctor_id ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION app_private.guard_prescription_country_with_order();


-- Serialize every actual delivery against its parent order, including direct
-- PostgREST INSERTs. Existing event UUID is the stable idempotency identifier.
CREATE FUNCTION app_private.guard_pharmacy_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_order public.dispensation_orders%ROWTYPE; v_total bigint;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'dispensation_delivery_immutable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_order FROM public.dispensation_orders WHERE id=NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dispensation_order_missing' USING ERRCODE='23514'; END IF;
  IF NOT app_private.pharmacy_actor_authorized(v_order.pharmacy_id,v_order.care_country)
     OR NOT EXISTS (SELECT 1 FROM public.pharmacists ph WHERE ph.id=NEW.pharmacist_id AND ph.user_id=auth.uid())
     OR NEW.pharmacy_id IS DISTINCT FROM v_order.pharmacy_id THEN
    RAISE EXCEPTION 'dispensation_delivery_actor_required' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.dispensation_events WHERE id=NEW.id) THEN
    RAISE EXCEPTION 'dispensation_delivery_already_recorded' USING ERRCODE='23505'; END IF;
  IF v_order.status NOT IN ('approved_for_dispensation','partially_dispensed')
     OR NOT v_order.prescriber_verified OR v_order.reconciliation_status IS DISTINCT FROM 'reconciled'
     OR v_order.clinician_decision<>'approved' OR v_order.deleted_at IS NOT NULL
     OR current_date<v_order.dispense_window_start OR current_date>v_order.dispense_window_end
     OR NOT app_private.pharmacy_release_evidence_matches(v_order.id)
     OR NOT app_private.pharmacy_required_validations_passed(v_order.id) THEN
    RAISE EXCEPTION 'dispensation_delivery_not_clinically_eligible' USING ERRCODE='23514';
  END IF;
  IF NEW.dispense_status NOT IN ('dispensed','partially_dispensed','substituted') THEN
    RAISE EXCEPTION 'dispensation_delivery_status_invalid' USING ERRCODE='23514';
  END IF;
  SELECT COALESCE(sum(e.dispensed_quantity),0) INTO v_total FROM public.dispensation_events e WHERE e.order_id=NEW.order_id;
  IF NEW.dispensed_quantity<=0 OR v_total+NEW.dispensed_quantity>v_order.quantity_units THEN
    RAISE EXCEPTION 'dispensation_quantity_exceeds_remaining' USING ERRCODE='23514';
  END IF;
  -- A caller-supplied approval boolean is never evidence of prescriber consent.
  -- Different medication/formulation must use prescriber clarification/reissue.
  IF NEW.substitution_type<>'none' OR NEW.substitution_approved_by_prescriber
     OR NEW.dispensed_medication IS DISTINCT FROM v_order.medication
     OR NEW.dispensed_formulation IS DISTINCT FROM v_order.formulation THEN
    RAISE EXCEPTION 'dispensation_substitution_requires_reissued_order' USING ERRCODE='23514';
  END IF;
  IF v_order.prescription_type='transition_bridge' AND NEW.dispensed_quantity<>v_order.quantity_units THEN
    RAISE EXCEPTION 'dispensation_bridge_quantity_mismatch' USING ERRCODE='23514';
  END IF;
  NEW.dispensed_at:=now();
  RETURN NEW;
END $$;
CREATE TRIGGER zz_pharmacy_delivery_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.dispensation_events
FOR EACH ROW EXECUTE FUNCTION app_private.guard_pharmacy_delivery();

CREATE FUNCTION app_private.finalize_pharmacy_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_total bigint; v_target integer; v_rx uuid; v_status text;
BEGIN
  SELECT quantity_units,prescription_id INTO v_target,v_rx FROM public.dispensation_orders WHERE id=NEW.order_id;
  SELECT sum(dispensed_quantity) INTO v_total FROM public.dispensation_events WHERE order_id=NEW.order_id;
  v_status:=CASE WHEN v_total=v_target THEN 'dispensed' ELSE 'partially_dispensed' END;
  UPDATE public.dispensation_orders SET status=v_status WHERE id=NEW.order_id;
  UPDATE public.prescriptions SET status=CASE WHEN v_total=v_target THEN 'dispensed_total' ELSE 'dispensed_partial' END WHERE id=v_rx;
  INSERT INTO public.pharmacy_audit_events(order_id,event_type,actor_id,actor_role,details)
  VALUES(NEW.order_id,'dispensation_executed',auth.uid(),'pharmacist',jsonb_build_object(
    'event_id',NEW.id,'dispensed_quantity',NEW.dispensed_quantity,'total_dispensed',v_total,'status',v_status));
  RETURN NEW;
END $$;
CREATE TRIGGER zz_pharmacy_delivery_finalize AFTER INSERT ON public.dispensation_events
FOR EACH ROW EXECUTE FUNCTION app_private.finalize_pharmacy_delivery();

-- Pending uniqueness is enforced by the parent-row lock in the request guard.

-- Real actor checks apply even when a privileged web/Edge caller bypasses RLS.
ALTER POLICY dispensation_orders_select_pharmacist ON public.dispensation_orders
USING (EXISTS (SELECT 1 FROM public.pharmacists ph WHERE ph.user_id=auth.uid()
  AND ph.care_country=dispensation_orders.care_country
  AND app_private.pharmacy_actor_authorized(ph.pharmacy_id,ph.care_country)
  AND (dispensation_orders.pharmacy_id=ph.pharmacy_id OR
    (dispensation_orders.pharmacy_id IS NULL AND dispensation_orders.status='pending'))));
ALTER POLICY dispensation_orders_update_pharmacist ON public.dispensation_orders
USING (EXISTS (SELECT 1 FROM public.pharmacists ph WHERE ph.user_id=auth.uid()
  AND ph.care_country=dispensation_orders.care_country
  AND app_private.pharmacy_actor_authorized(ph.pharmacy_id,ph.care_country)
  AND (dispensation_orders.pharmacy_id=ph.pharmacy_id OR
    (dispensation_orders.pharmacy_id IS NULL AND dispensation_orders.status='pending'))))
WITH CHECK (app_private.pharmacy_actor_authorized(pharmacy_id,care_country));
CREATE FUNCTION app_private.pharmacy_prescriber_authorized(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $prescriber$
  SELECT EXISTS (
    SELECT 1
    FROM public.dispensation_orders o
    JOIN public.doctors d ON d.id=o.doctor_id
    JOIN public.profiles pr ON pr.user_id=d.user_id
    WHERE o.id=p_order
      AND d.user_id=auth.uid()
      AND d.active
      AND pr.active
      AND pr.role::text='doctor'
      AND app_private.pharmacy_order_context_aligned(o.id)
  );
$prescriber$;
REVOKE ALL ON FUNCTION app_private.pharmacy_prescriber_authorized(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.pharmacy_prescriber_authorized(uuid) TO authenticated;

CREATE POLICY pharmacy_prescriber_update ON public.dispensation_orders FOR UPDATE TO authenticated
USING (app_private.pharmacy_prescriber_authorized(id))
WITH CHECK (app_private.pharmacy_prescriber_authorized(id));
ALTER POLICY dispensation_clarifications_update_doctor ON public.dispensation_clarifications
WITH CHECK (responded_by=auth.uid() AND EXISTS (
  SELECT 1 FROM public.dispensation_orders o JOIN public.doctors d ON d.id=o.doctor_id
  WHERE o.id=dispensation_clarifications.order_id AND d.user_id=auth.uid() AND d.active));

DO $acl$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app_private' AND p.proname IN (
      'guard_pharmacy_country','guard_pharmacist_country','guard_dispensation_country',
      'guard_dispensation_pharmacist_event','guard_dispensation_clarification_country',
      'guard_prescription_country_with_order','guard_pharmacy_delivery','finalize_pharmacy_delivery')
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $acl$;

CREATE UNIQUE INDEX pharmacy_one_order_per_prescription ON public.dispensation_orders(prescription_id) WHERE care_country IS NOT NULL;

-- This field is consumed by the current app/generated types but absent from the
-- versioned baseline. Never grant a service implicitly during schema repair.
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS enabled_service_tiers text[] NOT NULL DEFAULT '{}'::text[];

-- The canonical queue is pharmacy_dispatch_requests. Legacy queue writes cannot
-- create or reactivate clinical work, while historical completion/cancellation is preserved.
CREATE FUNCTION app_private.guard_pharmacy_dispatch_origin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_country text; v_doctor uuid; v_request uuid;
BEGIN
  IF TG_TABLE_NAME='doctors' THEN
    IF ((TG_OP='INSERT' AND cardinality(NEW.enabled_service_tiers)>0) OR
        (TG_OP='UPDATE' AND NEW.enabled_service_tiers IS DISTINCT FROM OLD.enabled_service_tiers))
       AND NOT EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.user_id=auth.uid() AND pr.active
         AND pr.role::text IN ('admin','platform_admin','organization_admin')) THEN
      RAISE EXCEPTION 'doctor_service_authorization_admin_required' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='pharmacy_consultation_requests' THEN
    IF TG_OP='INSERT' OR NEW.status::text NOT IN ('completed','cancelled','expired')
       OR (to_jsonb(NEW)-ARRAY['status','updated_at','completed_at','cancelled_at'])
          IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','completed_at','cancelled_at']) THEN
      RAISE EXCEPTION 'pharmacy_legacy_queue_disabled' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='pharmacy_dispatch_requests' THEN
    IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','updated_at','completed_at','cancelled_at'])
       IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','completed_at','cancelled_at'])
       AND NEW.status::text IN ('completed','cancelled','expired') THEN RETURN NEW; END IF;
    v_country:=NEW.care_country; v_doctor:=NEW.assigned_doctor_id; v_request:=NEW.id;
    IF NEW.pharmacy_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.pharmacies f
      WHERE f.id=NEW.pharmacy_id AND f.care_country=v_country AND f.active AND f.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'pharmacy_dispatch_origin_country_mismatch' USING ERRCODE='23514';
    END IF;
  ELSE
    IF TG_OP='UPDATE' AND NEW.status::text IN ('rejected','expired','cancelled')
       AND (NEW.doctor_id,NEW.dispatch_request_id) IS NOT DISTINCT FROM (OLD.doctor_id,OLD.dispatch_request_id)
    THEN RETURN NEW; END IF;
    SELECT care_country,id INTO v_country,v_request FROM public.pharmacy_dispatch_requests WHERE id=NEW.dispatch_request_id;
    v_doctor:=NEW.doctor_id;
  END IF;
  IF v_doctor IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.doctors d JOIN auth.users u ON u.id=d.user_id
    JOIN public.profiles pr ON pr.user_id=d.user_id AND pr.active AND pr.role::text='doctor'
    JOIN public.doctor_duty_status duty ON duty.doctor_id=d.id AND duty.is_on_duty
      AND duty.last_heartbeat_at>now()-interval '90 seconds' AND duty.last_heartbeat_at<=now()+interval '10 seconds'
    JOIN public.pharmacy_dispatch_requests r ON r.id=v_request
    WHERE d.id=v_doctor AND d.active AND d.care_country=v_country
      AND (duty.current_active_request_id IS NULL OR duty.current_active_request_id=v_request)
      AND r.tier_requested::text=ANY(d.enabled_service_tiers)
      AND r.tier_requested::text=ANY(duty.active_tiers::text[])
  ) THEN RAISE EXCEPTION 'pharmacy_dispatch_doctor_not_operationally_eligible' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.guard_pharmacy_dispatch_origin() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zzz_pharmacy_dispatch_origin BEFORE INSERT OR UPDATE ON public.pharmacy_dispatch_requests
FOR EACH ROW EXECUTE FUNCTION app_private.guard_pharmacy_dispatch_origin();
CREATE TRIGGER zzz_pharmacy_dispatch_offer_origin BEFORE INSERT OR UPDATE ON public.dispatch_offers
FOR EACH ROW EXECUTE FUNCTION app_private.guard_pharmacy_dispatch_origin();
CREATE TRIGGER zzz_pharmacy_legacy_disabled BEFORE INSERT OR UPDATE ON public.pharmacy_consultation_requests
FOR EACH ROW EXECUTE FUNCTION app_private.guard_pharmacy_dispatch_origin();

GRANT INSERT ON public.dispensation_orders TO authenticated;
CREATE POLICY pharmacy_prescriber_insert ON public.dispensation_orders FOR INSERT TO authenticated
WITH CHECK(EXISTS(SELECT 1 FROM public.doctors d WHERE d.id=dispensation_orders.doctor_id AND d.user_id=auth.uid() AND d.active));

ALTER TABLE public.dispensation_events ALTER COLUMN id DROP DEFAULT;

-- Preserve the complete current signup trigger; suppress only the unlicensed
-- pharmacist placeholder. Trusted enrollment creates membership after signup.
DO $pharmacy_signup$
DECLARE v_definition text; v_original text:=E'    WHEN ''pharmacist'' THEN\n      INSERT INTO public.pharmacists (user_id)\n      VALUES (NEW.id)\n      ON CONFLICT DO NOTHING;';
BEGIN
  SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure) INTO v_definition;
  IF position(v_original IN v_definition)=0 THEN
    RAISE EXCEPTION 'pharmacy_signup_definition_changed_requires_review';
  END IF;
  EXECUTE replace(v_definition,v_original,E'    WHEN ''pharmacist'' THEN\n      NULL; -- Membership requires trusted pharmacy enrollment.');
END $pharmacy_signup$;

-- Filter before selecting the FIFO candidate, not only when inserting its offer.
-- Preserve the existing matcher in full and fail if the reviewed anchor changes.
DO $eligible_candidates$
DECLARE
  v_definition text;
  v_anchor text := 'AND d.care_country = v_req.care_country';
  -- Inject into the canonical matcher so doctor-presence triggers and retry
  -- workers cannot bypass Jordan's payment-first rule.
  v_jordan_payment_gate text := $jordan_gate$
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.commercial_referral_partners rp
        WHERE rp.id = v_req.referral_partner_id AND rp.code = 'JORDAN'
      )
      OR EXISTS (
        SELECT 1 FROM public.pharmacy_dispatch_payments pay
        WHERE pay.dispatch_request_id = v_req.id
          AND pay.status = 'approved'
          AND pay.provider = 'mercadopago'
          AND pay.currency = 'BRL'
          AND pay.amount_minor = 7900
          AND pay.provider_payment_id IS NOT NULL
          AND pay.paid_at IS NOT NULL
      )
    )
  $jordan_gate$;
BEGIN
  SELECT pg_get_functiondef('public.match_dispatch_doctors(uuid)'::regprocedure) INTO v_definition;
  IF position(v_anchor IN v_definition)=0 THEN
    RAISE EXCEPTION 'pharmacy_matcher_definition_changed_requires_review';
  END IF;
  EXECUTE replace(
    v_definition,
    v_anchor,
    v_anchor || E'\n    AND d.user_id IS NOT NULL\n    AND EXISTS(SELECT 1 FROM public.profiles pr WHERE pr.user_id=d.user_id AND pr.active AND pr.role::text=''doctor'')\n    AND v_req.tier_requested::text=ANY(d.enabled_service_tiers)\n    AND v_req.tier_requested=ANY(dds.active_tiers)\n    AND dds.last_heartbeat_at<=now()+interval ''10 seconds''' || E'\n' || v_jordan_payment_gate
  );
END $eligible_candidates$;

CREATE TRIGGER zzz_pharmacy_doctor_service_authority BEFORE INSERT OR UPDATE OF enabled_service_tiers ON public.doctors
FOR EACH ROW EXECUTE FUNCTION app_private.guard_pharmacy_dispatch_origin();

-- A request/response and its workflow state/audit are one transaction. Notification
-- delivery is deliberately outside this transaction and may be retried afterward.
CREATE FUNCTION app_private.finalize_pharmacy_clarification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.dispensation_orders SET status='clarification_requested'
    WHERE id=NEW.order_id AND status IN ('under_review','blocked');
  ELSE
    UPDATE public.dispensation_orders
      SET status=CASE WHEN NEW.response_decision='cancelled' THEN 'cancelled' ELSE 'clarification_provided' END
    WHERE id=NEW.order_id AND status='clarification_requested';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'dispensation_clarification_state_conflict' USING ERRCODE='23514'; END IF;
  INSERT INTO public.pharmacy_audit_events(order_id,event_type,actor_id,actor_role,details)
  VALUES(NEW.order_id,CASE WHEN TG_OP='INSERT' THEN 'clarification_requested' ELSE 'clarification_responded' END,
    auth.uid(),CASE WHEN TG_OP='INSERT' THEN 'pharmacist' ELSE 'doctor' END,
    jsonb_build_object('clarification_id',NEW.id,'category',NEW.question_category));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.finalize_pharmacy_clarification() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zzz_pharmacy_clarification_finalize AFTER INSERT OR UPDATE ON public.dispensation_clarifications
FOR EACH ROW EXECUTE FUNCTION app_private.finalize_pharmacy_clarification();
