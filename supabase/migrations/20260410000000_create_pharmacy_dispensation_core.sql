-- =====================================================================
-- Pharmacy Dispensation Module — Core Schema
-- Author: Gemini Agent
-- Context: Validated dispensation with full traceability
-- Chain: Prescription → Dispensation Order → Pharmacy Validation → Dispense → Audit
-- =====================================================================

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- 1.1 Farmacias (entidades que dispensan)
CREATE TABLE IF NOT EXISTS public.pharmacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  license_number TEXT NOT NULL UNIQUE,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  phone TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE public.pharmacies IS 'Pharmacy entities authorized to dispense medications within AutaMedica';
COMMENT ON COLUMN public.pharmacies.license_number IS 'Matrícula farmacéutica oficial (registro provincial)';
COMMENT ON COLUMN public.pharmacies.address IS 'Structured address: {street, city, province, zip, lat, lng}';

-- 1.2 Farmacéuticos (operadores con matrícula profesional)
CREATE TABLE IF NOT EXISTS public.pharmacists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id) ON DELETE CASCADE,
  license_number TEXT NOT NULL,
  license_province TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pharmacist'
    CHECK (role IN ('pharmacist', 'pharmacy_director', 'pharmacy_tech')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pharmacy_id)
);

COMMENT ON TABLE public.pharmacists IS 'Licensed pharmacists operating within a pharmacy';
COMMENT ON COLUMN public.pharmacists.license_number IS 'MF + province code + number (e.g. MFBA12345)';
COMMENT ON COLUMN public.pharmacists.role IS 'pharmacist: standard dispenser, pharmacy_director: can override, pharmacy_tech: limited';

-- 1.3 Órdenes de dispensación (objeto estructurado que recibe la farmacia)
CREATE TABLE IF NOT EXISTS public.dispensation_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  pharmacy_id UUID REFERENCES public.pharmacies(id),

  -- Datos clínicos estructurados
  prescription_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (prescription_type IN ('standard', 'transition_bridge', 'continuation', 'emergency')),
  medication TEXT NOT NULL,
  formulation TEXT NOT NULL,
  dose_mg_per_day NUMERIC(10,2),
  quantity_units INTEGER NOT NULL CHECK (quantity_units > 0),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),

  -- Flags clínicos del prescriptor
  clinician_decision TEXT NOT NULL DEFAULT 'approved'
    CHECK (clinician_decision IN ('approved', 'conditional', 'under_review')),
  requires_clarification BOOLEAN NOT NULL DEFAULT false,
  extraordinary_dose_flag BOOLEAN NOT NULL DEFAULT false,
  prescriber_verified BOOLEAN NOT NULL DEFAULT true,
  reconciliation_status TEXT DEFAULT 'reconciled'
    CHECK (reconciliation_status IN ('reconciled', 'partial', 'pending', 'conflict')),

  -- Semáforo clínico (heredado del intake psiquiátrico)
  clinical_semaphore TEXT DEFAULT 'green'
    CHECK (clinical_semaphore IN ('green', 'yellow', 'red')),
  semaphore_reasons JSONB DEFAULT '[]'::jsonb,

  -- Ventana de dispensación
  dispense_window_start DATE NOT NULL,
  dispense_window_end DATE NOT NULL,

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'assigned',
      'under_review',
      'clarification_requested',
      'clarification_provided',
      'approved_for_dispensation',
      'dispensed',
      'partially_dispensed',
      'blocked',
      'cancelled',
      'expired'
    )),

  -- Notas
  prescriber_notes TEXT,
  internal_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT dispense_window_valid CHECK (dispense_window_end >= dispense_window_start)
);

COMMENT ON TABLE public.dispensation_orders IS 'Structured dispensation order derived from a signed prescription — NOT a raw PDF';
COMMENT ON COLUMN public.dispensation_orders.prescription_type IS 'standard: normal Rx, transition_bridge: short-term bridge, continuation: ongoing, emergency: urgent';
COMMENT ON COLUMN public.dispensation_orders.clinical_semaphore IS 'Inherited from psychiatry intake: green=safe, yellow=caution, red=blocked';
COMMENT ON COLUMN public.dispensation_orders.extraordinary_dose_flag IS 'True when dose exceeds p90 for the medication context';

-- 1.4 Validaciones farmacéuticas
CREATE TABLE IF NOT EXISTS public.dispensation_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.dispensation_orders(id) ON DELETE CASCADE,
  pharmacist_id UUID NOT NULL REFERENCES public.pharmacists(id),

  validation_type TEXT NOT NULL CHECK (validation_type IN (
    'patient_identity',
    'prescriber_identity',
    'medication_match',
    'formulation_match',
    'dose_check',
    'quantity_check',
    'validity_check',
    'bridge_protocol',
    'interaction_check',
    'duplicate_check',
    'controlled_substance'
  )),

  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'warning', 'overridden')),
  details TEXT,
  override_reason TEXT,
  override_authorized_by UUID REFERENCES public.pharmacists(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dispensation_validations IS 'Each validation check a pharmacist performs on a dispensation order';
COMMENT ON COLUMN public.dispensation_validations.validation_type IS 'Type of validation performed (identity, medication, dose, etc.)';
COMMENT ON COLUMN public.dispensation_validations.result IS 'pass: OK, fail: blocked, warning: proceed with caution, overridden: fail bypassed by director';

-- 1.5 Eventos de dispensación
CREATE TABLE IF NOT EXISTS public.dispensation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.dispensation_orders(id) ON DELETE CASCADE,
  pharmacist_id UUID NOT NULL REFERENCES public.pharmacists(id),
  pharmacy_id UUID NOT NULL REFERENCES public.pharmacies(id),

  dispense_status TEXT NOT NULL CHECK (dispense_status IN (
    'dispensed', 'partially_dispensed', 'blocked', 'substituted'
  )),

  dispensed_medication TEXT NOT NULL,
  dispensed_formulation TEXT NOT NULL,
  dispensed_quantity INTEGER NOT NULL CHECK (dispensed_quantity > 0),
  dispensed_batch_number TEXT,
  dispensed_expiry_date DATE,

  -- Sustitución
  substitution_type TEXT NOT NULL DEFAULT 'none'
    CHECK (substitution_type IN (
      'none', 'generic_equivalent', 'therapeutic_equivalent', 'emergency_substitute'
    )),
  substitution_reason TEXT,
  substitution_approved_by_prescriber BOOLEAN NOT NULL DEFAULT false,

  pharmacy_notes TEXT,
  pharmacist_signature_hash TEXT,

  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dispensation_events IS 'Actual medication dispensation records — the physical act of handing over medication';
COMMENT ON COLUMN public.dispensation_events.substitution_type IS 'none: exact match, generic_equivalent: same molecule, therapeutic_equivalent: same class, emergency_substitute: different molecule';

-- 1.6 Clarificaciones (diálogo farmacia ↔ prescriptor)
CREATE TABLE IF NOT EXISTS public.dispensation_clarifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.dispensation_orders(id) ON DELETE CASCADE,

  requested_by UUID NOT NULL REFERENCES auth.users(id),
  responded_by UUID REFERENCES auth.users(id),

  question TEXT NOT NULL,
  question_category TEXT NOT NULL CHECK (question_category IN (
    'dose_verification', 'formulation_mismatch', 'duration_concern',
    'interaction_alert', 'bridge_protocol', 'identity_concern', 'other'
  )),

  response TEXT,
  response_decision TEXT CHECK (response_decision IN (
    'confirmed', 'modified', 'cancelled'
  )),
  modified_fields JSONB,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'responded', 'expired')),

  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

COMMENT ON TABLE public.dispensation_clarifications IS 'Structured dialogue between pharmacy and prescriber for order clarification';
COMMENT ON COLUMN public.dispensation_clarifications.question_category IS 'Categorized reason for the clarification request';
COMMENT ON COLUMN public.dispensation_clarifications.modified_fields IS 'JSON describing which fields the prescriber modified in response';

-- 1.7 Audit log inmutable
CREATE TABLE IF NOT EXISTS public.pharmacy_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.dispensation_orders(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'order_created', 'order_assigned', 'validation_performed',
    'clarification_requested', 'clarification_responded',
    'dispensation_approved', 'dispensation_executed',
    'substitution_requested', 'substitution_approved',
    'order_blocked', 'order_cancelled', 'order_expired',
    'bridge_protocol_activated', 'extraordinary_dose_flagged'
  )),
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  actor_role TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pharmacy_audit_events IS 'Immutable audit trail for all pharmacy dispensation actions (ANMAT compliance)';

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_pharmacies_active
  ON public.pharmacies(active) WHERE active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pharmacists_user_id
  ON public.pharmacists(user_id);
CREATE INDEX IF NOT EXISTS idx_pharmacists_pharmacy_active
  ON public.pharmacists(pharmacy_id, active) WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_dispensation_orders_prescription
  ON public.dispensation_orders(prescription_id);
CREATE INDEX IF NOT EXISTS idx_dispensation_orders_patient
  ON public.dispensation_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_dispensation_orders_doctor
  ON public.dispensation_orders(doctor_id);
CREATE INDEX IF NOT EXISTS idx_dispensation_orders_pharmacy_status
  ON public.dispensation_orders(pharmacy_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dispensation_orders_status_window
  ON public.dispensation_orders(status, dispense_window_end) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dispensation_validations_order
  ON public.dispensation_validations(order_id);
CREATE INDEX IF NOT EXISTS idx_dispensation_validations_type_result
  ON public.dispensation_validations(order_id, validation_type, result);

CREATE INDEX IF NOT EXISTS idx_dispensation_events_order
  ON public.dispensation_events(order_id);

CREATE INDEX IF NOT EXISTS idx_dispensation_clarifications_order
  ON public.dispensation_clarifications(order_id);
CREATE INDEX IF NOT EXISTS idx_dispensation_clarifications_status
  ON public.dispensation_clarifications(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_pharmacy_audit_order
  ON public.pharmacy_audit_events(order_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_audit_actor
  ON public.pharmacy_audit_events(actor_id, timestamp DESC);

-- =====================================================================
-- 3. TRIGGERS — updated_at
-- =====================================================================

DROP TRIGGER IF EXISTS pharmacies_updated_at ON public.pharmacies;
CREATE TRIGGER pharmacies_updated_at
  BEFORE UPDATE ON public.pharmacies
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS pharmacists_updated_at ON public.pharmacists;
CREATE TRIGGER pharmacists_updated_at
  BEFORE UPDATE ON public.pharmacists
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS dispensation_orders_updated_at ON public.dispensation_orders;
CREATE TRIGGER dispensation_orders_updated_at
  BEFORE UPDATE ON public.dispensation_orders
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- =====================================================================
-- 4. TRIGGERS — Business Rules (Hard Enforcement)
-- =====================================================================

-- RULE 1: Bridge prescriptions are immutable without prescriber revalidation
CREATE OR REPLACE FUNCTION public.enforce_bridge_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.prescription_type = 'transition_bridge'
     AND NEW.prescription_type = 'transition_bridge'
     AND (
       NEW.quantity_units IS DISTINCT FROM OLD.quantity_units
       OR NEW.formulation IS DISTINCT FROM OLD.formulation
       OR NEW.dose_mg_per_day IS DISTINCT FROM OLD.dose_mg_per_day
     )
     AND NEW.status NOT IN ('clarification_provided', 'cancelled')
  THEN
    RAISE EXCEPTION 'Bridge prescriptions cannot be modified without prescriber revalidation. '
      'Current status: %. Use clarification workflow to request changes.', NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE PLPGSQL;

DROP TRIGGER IF EXISTS tr_enforce_bridge_immutability ON public.dispensation_orders;
CREATE TRIGGER tr_enforce_bridge_immutability
  BEFORE UPDATE ON public.dispensation_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_bridge_immutability();

-- RULE 2: Extraordinary dose requires explicit dose_check validation
CREATE OR REPLACE FUNCTION public.enforce_extraordinary_dose_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.extraordinary_dose_flag = true
     AND NEW.status = 'approved_for_dispensation'
     AND OLD.status IS DISTINCT FROM 'approved_for_dispensation'
  THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.dispensation_validations
      WHERE order_id = NEW.id
        AND validation_type = 'dose_check'
        AND result IN ('pass', 'overridden')
    ) THEN
      RAISE EXCEPTION 'Extraordinary dose orders require an explicit dose_check validation '
        'with result pass or overridden before approval for dispensation.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE PLPGSQL;

DROP TRIGGER IF EXISTS tr_enforce_extraordinary_dose_review ON public.dispensation_orders;
CREATE TRIGGER tr_enforce_extraordinary_dose_review
  BEFORE UPDATE ON public.dispensation_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_extraordinary_dose_review();

-- RULE 3: Substitution on controlled substances requires prescriber approval
CREATE OR REPLACE FUNCTION public.enforce_substitution_controls()
RETURNS TRIGGER AS $$
DECLARE
  v_order RECORD;
BEGIN
  IF NEW.substitution_type != 'none' THEN
    -- substitution_reason is required
    IF NEW.substitution_reason IS NULL OR trim(NEW.substitution_reason) = '' THEN
      RAISE EXCEPTION 'Substitution requires a documented reason.'
        USING ERRCODE = 'P0003';
    END IF;

    -- For bridge/extraordinary orders, prescriber approval is mandatory
    SELECT prescription_type, extraordinary_dose_flag
    INTO v_order
    FROM public.dispensation_orders
    WHERE id = NEW.order_id;

    IF (v_order.prescription_type = 'transition_bridge' OR v_order.extraordinary_dose_flag = true)
       AND NEW.substitution_approved_by_prescriber = false
    THEN
      RAISE EXCEPTION 'Substitution on bridge or extraordinary dose orders requires prescriber approval.'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE PLPGSQL;

DROP TRIGGER IF EXISTS tr_enforce_substitution_controls ON public.dispensation_events;
CREATE TRIGGER tr_enforce_substitution_controls
  BEFORE INSERT ON public.dispensation_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_substitution_controls();

-- RULE 4: Audit log immutability (reuses existing function)
DROP TRIGGER IF EXISTS tr_immutable_pharmacy_audit ON public.pharmacy_audit_events;
CREATE TRIGGER tr_immutable_pharmacy_audit
  BEFORE UPDATE OR DELETE ON public.pharmacy_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_modification_on_audit_log();

-- =====================================================================
-- 5. RLS
-- =====================================================================

ALTER TABLE public.pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensation_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensation_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispensation_clarifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_audit_events ENABLE ROW LEVEL SECURITY;

-- Helper: current pharmacist's pharmacy_id
CREATE OR REPLACE FUNCTION public.current_pharmacist_pharmacy_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ph.pharmacy_id
  FROM public.pharmacists ph
  WHERE ph.user_id = auth.uid()
    AND ph.active = true;
$$;

REVOKE ALL ON FUNCTION public.current_pharmacist_pharmacy_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_pharmacist_pharmacy_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_pharmacist_pharmacy_ids() TO service_role;

-- Helper: current pharmacist id
CREATE OR REPLACE FUNCTION public.current_pharmacist_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ph.id
  FROM public.pharmacists ph
  WHERE ph.user_id = auth.uid()
    AND ph.active = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_pharmacist_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_pharmacist_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_pharmacist_id() TO service_role;

-- ── Pharmacies ──

DROP POLICY IF EXISTS "pharmacies_select_authenticated" ON public.pharmacies;
CREATE POLICY "pharmacies_select_authenticated"
  ON public.pharmacies FOR SELECT TO authenticated
  USING (active = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS "pharmacies_admin_all" ON public.pharmacies;
CREATE POLICY "pharmacies_admin_all"
  ON public.pharmacies FOR ALL TO authenticated
  USING (public.is_system_admin());

-- ── Pharmacists ──

DROP POLICY IF EXISTS "pharmacists_select_own" ON public.pharmacists;
CREATE POLICY "pharmacists_select_own"
  ON public.pharmacists FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_system_admin());

DROP POLICY IF EXISTS "pharmacists_select_same_pharmacy" ON public.pharmacists;
CREATE POLICY "pharmacists_select_same_pharmacy"
  ON public.pharmacists FOR SELECT TO authenticated
  USING (pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids()));

-- ── Dispensation Orders ──

DROP POLICY IF EXISTS "dispensation_orders_select_pharmacist" ON public.dispensation_orders;
CREATE POLICY "dispensation_orders_select_pharmacist"
  ON public.dispensation_orders FOR SELECT TO authenticated
  USING (
    pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
  );

DROP POLICY IF EXISTS "dispensation_orders_select_doctor" ON public.dispensation_orders;
CREATE POLICY "dispensation_orders_select_doctor"
  ON public.dispensation_orders FOR SELECT TO authenticated
  USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "dispensation_orders_select_patient" ON public.dispensation_orders;
CREATE POLICY "dispensation_orders_select_patient"
  ON public.dispensation_orders FOR SELECT TO authenticated
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "dispensation_orders_update_pharmacist" ON public.dispensation_orders;
CREATE POLICY "dispensation_orders_update_pharmacist"
  ON public.dispensation_orders FOR UPDATE TO authenticated
  USING (
    pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
  )
  WITH CHECK (
    pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
  );

DROP POLICY IF EXISTS "dispensation_orders_select_admin" ON public.dispensation_orders;
CREATE POLICY "dispensation_orders_select_admin"
  ON public.dispensation_orders FOR SELECT TO authenticated
  USING (public.is_system_admin());

-- ── Dispensation Validations ──

DROP POLICY IF EXISTS "dispensation_validations_select_pharmacist" ON public.dispensation_validations;
CREATE POLICY "dispensation_validations_select_pharmacist"
  ON public.dispensation_validations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_validations.order_id
        AND o.pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
    )
  );

DROP POLICY IF EXISTS "dispensation_validations_insert_pharmacist" ON public.dispensation_validations;
CREATE POLICY "dispensation_validations_insert_pharmacist"
  ON public.dispensation_validations FOR INSERT TO authenticated
  WITH CHECK (
    pharmacist_id = public.current_pharmacist_id()
    AND EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_validations.order_id
        AND o.pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
    )
  );

DROP POLICY IF EXISTS "dispensation_validations_select_doctor" ON public.dispensation_validations;
CREATE POLICY "dispensation_validations_select_doctor"
  ON public.dispensation_validations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_validations.order_id
        AND o.doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

-- ── Dispensation Events ──

DROP POLICY IF EXISTS "dispensation_events_select_pharmacist" ON public.dispensation_events;
CREATE POLICY "dispensation_events_select_pharmacist"
  ON public.dispensation_events FOR SELECT TO authenticated
  USING (
    pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
  );

DROP POLICY IF EXISTS "dispensation_events_insert_pharmacist" ON public.dispensation_events;
CREATE POLICY "dispensation_events_insert_pharmacist"
  ON public.dispensation_events FOR INSERT TO authenticated
  WITH CHECK (
    pharmacist_id = public.current_pharmacist_id()
    AND pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
  );

DROP POLICY IF EXISTS "dispensation_events_select_doctor" ON public.dispensation_events;
CREATE POLICY "dispensation_events_select_doctor"
  ON public.dispensation_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_events.order_id
        AND o.doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "dispensation_events_select_patient" ON public.dispensation_events;
CREATE POLICY "dispensation_events_select_patient"
  ON public.dispensation_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_events.order_id
        AND o.patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
    )
  );

-- ── Dispensation Clarifications ──

DROP POLICY IF EXISTS "dispensation_clarifications_select_pharmacist" ON public.dispensation_clarifications;
CREATE POLICY "dispensation_clarifications_select_pharmacist"
  ON public.dispensation_clarifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_clarifications.order_id
        AND o.pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
    )
  );

DROP POLICY IF EXISTS "dispensation_clarifications_insert_pharmacist" ON public.dispensation_clarifications;
CREATE POLICY "dispensation_clarifications_insert_pharmacist"
  ON public.dispensation_clarifications FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_clarifications.order_id
        AND o.pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
    )
  );

DROP POLICY IF EXISTS "dispensation_clarifications_select_doctor" ON public.dispensation_clarifications;
CREATE POLICY "dispensation_clarifications_select_doctor"
  ON public.dispensation_clarifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_clarifications.order_id
        AND o.doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "dispensation_clarifications_update_doctor" ON public.dispensation_clarifications;
CREATE POLICY "dispensation_clarifications_update_doctor"
  ON public.dispensation_clarifications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = dispensation_clarifications.order_id
        AND o.doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    responded_by = auth.uid()
  );

-- ── Pharmacy Audit Events ──

DROP POLICY IF EXISTS "pharmacy_audit_select_pharmacist" ON public.pharmacy_audit_events;
CREATE POLICY "pharmacy_audit_select_pharmacist"
  ON public.pharmacy_audit_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = pharmacy_audit_events.order_id
        AND o.pharmacy_id IN (SELECT public.current_pharmacist_pharmacy_ids())
    )
  );

DROP POLICY IF EXISTS "pharmacy_audit_select_doctor" ON public.pharmacy_audit_events;
CREATE POLICY "pharmacy_audit_select_doctor"
  ON public.pharmacy_audit_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispensation_orders o
      WHERE o.id = pharmacy_audit_events.order_id
        AND o.doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "pharmacy_audit_select_admin" ON public.pharmacy_audit_events;
CREATE POLICY "pharmacy_audit_select_admin"
  ON public.pharmacy_audit_events FOR SELECT TO authenticated
  USING (public.is_system_admin());

-- =====================================================================
-- 6. GRANTS
-- =====================================================================

-- Authenticated users (filtered by RLS)
GRANT SELECT ON TABLE public.pharmacies TO authenticated;
GRANT SELECT ON TABLE public.pharmacists TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.dispensation_orders TO authenticated;
GRANT SELECT, INSERT ON TABLE public.dispensation_validations TO authenticated;
GRANT SELECT, INSERT ON TABLE public.dispensation_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.dispensation_clarifications TO authenticated;
GRANT SELECT ON TABLE public.pharmacy_audit_events TO authenticated;

-- Service role (Edge Functions)
GRANT ALL ON TABLE public.pharmacies TO service_role;
GRANT ALL ON TABLE public.pharmacists TO service_role;
GRANT ALL ON TABLE public.dispensation_orders TO service_role;
GRANT ALL ON TABLE public.dispensation_validations TO service_role;
GRANT ALL ON TABLE public.dispensation_events TO service_role;
GRANT ALL ON TABLE public.dispensation_clarifications TO service_role;
GRANT ALL ON TABLE public.pharmacy_audit_events TO service_role;
