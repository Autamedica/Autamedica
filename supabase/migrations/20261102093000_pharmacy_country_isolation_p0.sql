-- P0 security: isolate BR/AR pharmacy fulfillment and deny anonymous-country dispensing.
-- No historical prescription edits. Rollout gate: pharmacy tables must be empty
-- (confirmed on AutaMedica production on 2026-11-02).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pharmacies LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.pharmacists LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.dispensation_orders LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.dispensation_events LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.dispensation_validations LIMIT 1)
  THEN RAISE EXCEPTION 'pharmacy_country_isolation_requires_data_reconciliation';
  END IF;
END $$;

ALTER TABLE public.pharmacies
  ADD COLUMN care_country text NOT NULL CONSTRAINT pharmacies_care_country_check CHECK (care_country IN ('AR','BR'));
ALTER TABLE public.pharmacists
  ADD COLUMN care_country text NOT NULL CONSTRAINT pharmacists_care_country_check CHECK (care_country IN ('AR','BR'));
ALTER TABLE public.dispensation_orders
  ADD COLUMN care_country text NOT NULL CONSTRAINT dispensation_orders_care_country_check CHECK (care_country IN ('AR','BR'));

COMMENT ON COLUMN public.pharmacies.care_country IS 'Required licensed jurisdiction of this dispensing pharmacy (AR/BR).';
COMMENT ON COLUMN public.pharmacists.care_country IS 'Enforced server-side from the assigned pharmacy, never caller-controlled.';
COMMENT ON COLUMN public.dispensation_orders.care_country IS 'Enforced server-side from prescription.country_code and clinical doctor/patient jurisdiction.';

-- Never default to clinically verified or reconciled merely on order insertion.
ALTER TABLE public.dispensation_orders
  ALTER COLUMN prescriber_verified SET DEFAULT false,
  ALTER COLUMN reconciliation_status SET DEFAULT 'pending',
  ALTER COLUMN clinician_decision SET DEFAULT 'under_review';

CREATE OR REPLACE FUNCTION app_private.guard_pharmacy_country()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.care_country IS DISTINCT FROM OLD.care_country THEN
    RAISE EXCEPTION 'pharmacy_country_immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.care_country NOT IN ('AR','BR') OR NEW.care_country IS NULL THEN
    RAISE EXCEPTION 'pharmacy_country_required' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_pharmacy_country
BEFORE INSERT OR UPDATE ON public.pharmacies
FOR EACH ROW EXECUTE FUNCTION app_private.guard_pharmacy_country();

CREATE OR REPLACE FUNCTION app_private.guard_pharmacist_country()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_country text;
BEGIN
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
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rx record;
  v_doctor_country text;
  v_patient_country text;
  v_pharmacy_country text;
BEGIN
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
  SELECT d.care_country INTO v_doctor_country FROM public.doctors d WHERE d.id = v_rx.doctor_id AND d.active;
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

  IF NEW.status IN ('approved_for_dispensation','partially_dispensed','dispensed') THEN
    IF NEW.pharmacy_id IS NULL OR NEW.prescriber_verified IS DISTINCT FROM true
       OR NEW.reconciliation_status IS DISTINCT FROM 'reconciled'
       OR NEW.clinician_decision IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'dispensation_clinical_verification_required' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_dispensation_country
BEFORE INSERT OR UPDATE ON public.dispensation_orders
FOR EACH ROW EXECUTE FUNCTION app_private.guard_dispensation_country();

CREATE OR REPLACE FUNCTION app_private.guard_dispensation_pharmacist_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order_country text;
  v_order_pharmacy uuid;
  v_prescription_country text;
  v_doctor_country text;
  v_patient_country text;
  v_pharmacist_country text;
  v_pharmacist_pharmacy uuid;
BEGIN
  SELECT o.care_country, o.pharmacy_id, rx.country_code, d.care_country, pa.care_country
    INTO v_order_country, v_order_pharmacy, v_prescription_country, v_doctor_country, v_patient_country
  FROM public.dispensation_orders o
  JOIN public.prescriptions rx ON rx.id = o.prescription_id
  JOIN public.doctors d ON d.id = o.doctor_id AND d.active
  JOIN public.patients pa ON pa.id = o.patient_id AND pa.active
  WHERE o.id = NEW.order_id;
  SELECT ph.care_country, ph.pharmacy_id INTO v_pharmacist_country, v_pharmacist_pharmacy
  FROM public.pharmacists ph
  JOIN public.pharmacies f ON f.id=ph.pharmacy_id AND f.active AND f.deleted_at IS NULL AND f.care_country=ph.care_country
  WHERE ph.id = NEW.pharmacist_id AND ph.active
    AND ph.role IN ('pharmacist','pharmacy_director')
    AND NULLIF(btrim(ph.license_number),'') IS NOT NULL;
  IF v_order_pharmacy IS NULL OR v_pharmacist_pharmacy IS NULL
     OR v_order_country IS DISTINCT FROM v_prescription_country
     OR v_order_country IS DISTINCT FROM v_doctor_country
     OR v_order_country IS DISTINCT FROM v_patient_country
     OR v_order_pharmacy IS DISTINCT FROM v_pharmacist_pharmacy
     OR v_order_country IS DISTINCT FROM v_pharmacist_country THEN
    RAISE EXCEPTION 'dispensation_event_pharmacy_country_mismatch' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'dispensation_events'
     AND (to_jsonb(NEW)->>'pharmacy_id')::uuid IS DISTINCT FROM v_order_pharmacy THEN
    RAISE EXCEPTION 'dispensation_event_pharmacy_identity_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER zz_dispensation_validations_country
BEFORE INSERT OR UPDATE ON public.dispensation_validations
FOR EACH ROW EXECUTE FUNCTION app_private.guard_dispensation_pharmacist_event();

CREATE TRIGGER zz_dispensation_events_country
BEFORE INSERT OR UPDATE ON public.dispensation_events
FOR EACH ROW EXECUTE FUNCTION app_private.guard_dispensation_pharmacist_event();

-- Cross-country unassigned queue is not visible/claimable even through PostgREST.
ALTER POLICY dispensation_orders_select_pharmacist ON public.dispensation_orders
USING (
  EXISTS (
    SELECT 1 FROM public.pharmacists ph JOIN public.pharmacies f ON f.id=ph.pharmacy_id
    WHERE ph.user_id=auth.uid() AND ph.active
      AND ph.role IN ('pharmacist','pharmacy_director')
      AND NULLIF(btrim(ph.license_number),'') IS NOT NULL
      AND f.active AND f.deleted_at IS NULL
      AND ph.care_country=f.care_country
      AND f.care_country=dispensation_orders.care_country
      AND (dispensation_orders.pharmacy_id=f.id OR
           (dispensation_orders.pharmacy_id IS NULL AND dispensation_orders.status='pending'))
  )
);
ALTER POLICY dispensation_orders_update_pharmacist ON public.dispensation_orders
USING (
  EXISTS (
    SELECT 1 FROM public.pharmacists ph JOIN public.pharmacies f ON f.id=ph.pharmacy_id
    WHERE ph.user_id=auth.uid() AND ph.active
      AND ph.role IN ('pharmacist','pharmacy_director')
      AND NULLIF(btrim(ph.license_number),'') IS NOT NULL
      AND f.active AND f.deleted_at IS NULL
      AND ph.care_country=f.care_country
      AND f.care_country=dispensation_orders.care_country
      AND (dispensation_orders.pharmacy_id=f.id OR
           (dispensation_orders.pharmacy_id IS NULL AND dispensation_orders.status='pending'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pharmacists ph JOIN public.pharmacies f ON f.id=ph.pharmacy_id
    WHERE ph.user_id=auth.uid() AND ph.active
      AND ph.role IN ('pharmacist','pharmacy_director')
      AND NULLIF(btrim(ph.license_number),'') IS NOT NULL
      AND f.active AND f.deleted_at IS NULL
      AND ph.care_country=f.care_country
      AND f.care_country=dispensation_orders.care_country
      AND dispensation_orders.pharmacy_id=f.id
  )
);

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

-- Country-scoped queue lookup for the direct-authenticated portal.
CREATE INDEX IF NOT EXISTS idx_dispensation_orders_country_unassigned
  ON public.dispensation_orders(care_country, status, created_at)
  WHERE pharmacy_id IS NULL AND deleted_at IS NULL;

-- Once a structured dispensing order exists, do not reclassify its source Rx.
CREATE OR REPLACE FUNCTION app_private.guard_prescription_country_with_order()
RETURNS trigger
LANGUAGE plpgsql
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
