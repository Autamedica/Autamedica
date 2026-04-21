-- ============================================================
-- Sprint 2 — Shipping (última milla) + Adherencia (toma de medicación)
-- ============================================================

-- 1. SHIPMENTS — un envío asociado a una orden de dispensación
CREATE TABLE IF NOT EXISTS public.shipments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensation_order_id uuid NOT NULL REFERENCES public.dispensation_orders(id) ON DELETE RESTRICT,
  courier               text NOT NULL CHECK (courier IN ('andreani_farma', 'oca_farma', 'urbano', 'cadetería_local')),
  tracking_number       text,
  courier_order_id      text,
  recipient_name        text NOT NULL,
  recipient_phone       text NOT NULL,
  recipient_address     jsonb NOT NULL,
  service_level         text NOT NULL DEFAULT 'standard'
                        CHECK (service_level IN ('same_day', 'next_day', 'standard', 'cold_chain')),
  status                text NOT NULL DEFAULT 'label_pending'
                        CHECK (status IN (
                          'label_pending', 'label_created', 'picked_up',
                          'in_transit', 'out_for_delivery', 'delivered',
                          'delivery_failed', 'returned', 'cancelled'
                        )),
  estimated_delivery_at timestamptz,
  delivered_at          timestamptz,
  delivery_proof_url    text,
  signed_by             text,
  cost_ars              numeric(10, 2),
  label_pdf_url         text,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (courier, tracking_number)
);

CREATE INDEX IF NOT EXISTS idx_shipments_status
  ON public.shipments (status, estimated_delivery_at);
CREATE INDEX IF NOT EXISTS idx_shipments_dispensation
  ON public.shipments (dispensation_order_id);

COMMENT ON TABLE public.shipments IS
  'Envíos de última milla. Un shipment por dispensation_order que requiera delivery.';

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_shipments_updated_at ON public.shipments;
CREATE TRIGGER trg_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. SHIPMENT EVENTS — trazabilidad granular (feed del webhook del courier)
CREATE TABLE IF NOT EXISTS public.shipment_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id    uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  event_time     timestamptz NOT NULL,
  location       text,
  description    text,
  raw_webhook    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment
  ON public.shipment_events (shipment_id, event_time DESC);

ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

-- 3. MEDICATION SCHEDULES — horarios de toma del paciente por receta
CREATE TABLE IF NOT EXISTS public.medication_schedules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  patient_id       uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  drug_name        text NOT NULL,
  dosage           text NOT NULL,
  times_per_day    jsonb NOT NULL DEFAULT '[]'::jsonb,
  days_pattern     text NOT NULL DEFAULT 'daily'
                   CHECK (days_pattern IN ('daily', 'weekdays', 'weekends', 'custom')),
  custom_days      jsonb,
  start_date       date NOT NULL,
  end_date         date,
  active           boolean NOT NULL DEFAULT true,
  timezone         text NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medication_dates_valid CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_medication_schedules_active_patient
  ON public.medication_schedules (patient_id, active, start_date);
CREATE INDEX IF NOT EXISTS idx_medication_schedules_prescription
  ON public.medication_schedules (prescription_id);

COMMENT ON COLUMN public.medication_schedules.times_per_day IS
  'Array de {hour, minute} de tomas diarias. Ej: [{"hour":8,"minute":0},{"hour":20,"minute":0}]';

ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_medication_schedules_updated_at ON public.medication_schedules;
CREATE TRIGGER trg_medication_schedules_updated_at
  BEFORE UPDATE ON public.medication_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. MEDICATION INTAKE EVENTS — cada toma esperada y si se confirmó
CREATE TABLE IF NOT EXISTS public.medication_intake_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id           uuid NOT NULL REFERENCES public.medication_schedules(id) ON DELETE CASCADE,
  patient_id            uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  expected_at           timestamptz NOT NULL,
  confirmed_at          timestamptz,
  confirmation_channel  text CHECK (confirmation_channel IN ('whatsapp', 'app', 'auto', 'manual')),
  skipped               boolean NOT NULL DEFAULT false,
  skipped_reason        text,
  reminder_sent_at      timestamptz,
  reminder_message_id   text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, expected_at)
);

CREATE INDEX IF NOT EXISTS idx_intake_events_pending
  ON public.medication_intake_events (expected_at, reminder_sent_at)
  WHERE confirmed_at IS NULL AND skipped = false;
CREATE INDEX IF NOT EXISTS idx_intake_events_patient_recent
  ON public.medication_intake_events (patient_id, expected_at DESC);

COMMENT ON TABLE public.medication_intake_events IS
  'Eventos de toma esperada. reminder_sent_at marca cuando se disparó el WhatsApp.';

ALTER TABLE public.medication_intake_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_intake_events_updated_at ON public.medication_intake_events;
CREATE TRIGGER trg_intake_events_updated_at
  BEFORE UPDATE ON public.medication_intake_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS service_role (admin via backend)
DROP POLICY IF EXISTS "service_role_all_shipments" ON public.shipments;
CREATE POLICY "service_role_all_shipments" ON public.shipments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_shipment_events" ON public.shipment_events;
CREATE POLICY "service_role_all_shipment_events" ON public.shipment_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_medication_schedules" ON public.medication_schedules;
CREATE POLICY "service_role_all_medication_schedules" ON public.medication_schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_intake_events" ON public.medication_intake_events;
CREATE POLICY "service_role_all_intake_events" ON public.medication_intake_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Flag de shipping en dispensation_orders (si aún no existe)
ALTER TABLE public.dispensation_orders
  ADD COLUMN IF NOT EXISTS dispense_mode text DEFAULT 'pickup'
    CHECK (dispense_mode IN ('pickup', 'shipping'));

COMMENT ON COLUMN public.dispensation_orders.dispense_mode IS
  'pickup: paciente retira en farmacia. shipping: courier entrega a domicilio.';
