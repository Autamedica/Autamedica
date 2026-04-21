-- ============================================================
-- Sprint 3 — ANMAT trazabilidad + Obras sociales + Farmacovigilancia
-- ============================================================

-- 1. ANMAT SNT trace events (cola idempotente de reporte a ANMAT)
CREATE TABLE IF NOT EXISTS public.anmat_trace_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensation_event_id  uuid NOT NULL REFERENCES public.dispensation_events(id) ON DELETE CASCADE,
  gtin                   text NOT NULL,
  serie                  text NOT NULL,
  lote                   text NOT NULL,
  vencimiento            date NOT NULL,
  event_type             text NOT NULL
                         CHECK (event_type IN ('informar_medicamento', 'confirmar_transaccion', 'anular_transaccion')),
  anmat_transaction_id   text,
  status                 text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'reported', 'confirmed', 'failed', 'skipped')),
  attempt_count          integer NOT NULL DEFAULT 0,
  next_attempt_at        timestamptz,
  last_error             text,
  request_payload        jsonb,
  response_payload       jsonb,
  reported_at            timestamptz,
  confirmed_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispensation_event_id, event_type, gtin, serie)
);

CREATE INDEX IF NOT EXISTS idx_anmat_trace_pending
  ON public.anmat_trace_events (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_anmat_trace_dispensation
  ON public.anmat_trace_events (dispensation_event_id);

COMMENT ON TABLE public.anmat_trace_events IS
  'Cola de reporte a Sistema Nacional de Trazabilidad (ANMAT Disp 3683/2011)';

ALTER TABLE public.anmat_trace_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_anmat_trace_updated_at ON public.anmat_trace_events;
CREATE TRIGGER trg_anmat_trace_updated_at
  BEFORE UPDATE ON public.anmat_trace_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Insurance authorizations (autorización previa obras sociales)
CREATE TABLE IF NOT EXISTS public.insurance_authorizations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id        uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  insurance_provider     text NOT NULL
                         CHECK (insurance_provider IN (
                           'osde', 'swiss_medical', 'medife', 'galeno', 'accord', 'pami',
                           'omint', 'sancor_salud', 'prepaga_otra', 'particular'
                         )),
  member_number          text NOT NULL,
  authorization_number   text,
  coverage_pct           numeric(5, 2) CHECK (coverage_pct IS NULL OR (coverage_pct >= 0 AND coverage_pct <= 100)),
  approved_amount_ars    numeric(12, 2),
  out_of_pocket_ars      numeric(12, 2),
  plan_code              text,
  status                 text NOT NULL DEFAULT 'requested'
                         CHECK (status IN ('requested', 'approved', 'denied', 'pending_review', 'expired', 'cancelled')),
  denial_reason          text,
  requested_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at            timestamptz,
  expires_at             timestamptz,
  raw_request            jsonb,
  raw_response           jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_auth_prescription
  ON public.insurance_authorizations (prescription_id, status);
CREATE INDEX IF NOT EXISTS idx_insurance_auth_pending
  ON public.insurance_authorizations (status, requested_at)
  WHERE status IN ('requested', 'pending_review');

COMMENT ON TABLE public.insurance_authorizations IS
  'Autorizaciones de obra social para recetas. Prepagas responden con cobertura y copago.';

ALTER TABLE public.insurance_authorizations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_insurance_auth_updated_at ON public.insurance_authorizations;
CREATE TRIGGER trg_insurance_auth_updated_at
  BEFORE UPDATE ON public.insurance_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Adverse Drug Reactions (farmacovigilancia)
CREATE TABLE IF NOT EXISTS public.adverse_drug_reactions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id             uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  prescription_id        uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,
  doctor_id              uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  reported_by            text NOT NULL
                         CHECK (reported_by IN ('patient', 'doctor', 'pharmacist', 'caregiver')),
  onset_date             date NOT NULL,
  resolution_date        date,
  suspected_drug         text NOT NULL,
  symptoms               jsonb NOT NULL,
  severity               text NOT NULL
                         CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening', 'fatal')),
  causality              text
                         CHECK (causality IS NULL OR causality IN ('certain', 'probable', 'possible', 'unlikely', 'unassessable')),
  action_taken           text,
  outcome                text
                         CHECK (outcome IS NULL OR outcome IN ('recovered', 'recovering', 'not_recovered', 'sequelae', 'fatal', 'unknown')),
  concomitant_medication jsonb,
  narrative              text,
  reported_to_anmat_at   timestamptz,
  anmat_case_id          text,
  status                 text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'submitted', 'evaluated', 'reported_anmat', 'resolved', 'rejected')),
  evaluated_at           timestamptz,
  evaluated_by_doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT adr_dates_valid CHECK (resolution_date IS NULL OR resolution_date >= onset_date)
);

CREATE INDEX IF NOT EXISTS idx_adr_patient
  ON public.adverse_drug_reactions (patient_id, onset_date DESC);
CREATE INDEX IF NOT EXISTS idx_adr_pending_evaluation
  ON public.adverse_drug_reactions (status, created_at)
  WHERE status IN ('submitted', 'draft');
CREATE INDEX IF NOT EXISTS idx_adr_prescription
  ON public.adverse_drug_reactions (prescription_id);

COMMENT ON TABLE public.adverse_drug_reactions IS
  'Eventos adversos (RAM) reportados por pacientes/médicos. Potencial reporte a Sistema Nacional Farmacovigilancia ANMAT.';

ALTER TABLE public.adverse_drug_reactions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_adr_updated_at ON public.adverse_drug_reactions;
CREATE TRIGGER trg_adr_updated_at
  BEFORE UPDATE ON public.adverse_drug_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS service_role
DROP POLICY IF EXISTS "service_role_all_anmat_trace" ON public.anmat_trace_events;
CREATE POLICY "service_role_all_anmat_trace" ON public.anmat_trace_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_insurance_auth" ON public.insurance_authorizations;
CREATE POLICY "service_role_all_insurance_auth" ON public.insurance_authorizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_adr" ON public.adverse_drug_reactions;
CREATE POLICY "service_role_all_adr" ON public.adverse_drug_reactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
