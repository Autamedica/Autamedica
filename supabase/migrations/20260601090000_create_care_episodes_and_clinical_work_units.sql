-- CEEDS economic/UX model:
-- A paid appointment opens one care episode with included safe-closure review.
-- CEEDS closure can create internal doctor work without charging the patient again.

CREATE TABLE IF NOT EXISTS public.care_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  source_appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  source_payment_id UUID REFERENCES public.appointment_payments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closure_pending', 'closed', 'escalated', 'expired', 'cancelled')),
  included_ceeds_reviews INTEGER NOT NULL DEFAULT 1 CHECK (included_ceeds_reviews >= 0),
  used_ceeds_reviews INTEGER NOT NULL DEFAULT 0 CHECK (used_ceeds_reviews >= 0),
  funding_source TEXT NOT NULL DEFAULT 'included_consultation'
    CHECK (funding_source IN ('included_consultation', 'payer', 'subscription', 'platform', 'manual')),
  patient_visible_label TEXT NOT NULL DEFAULT 'Consulta AutaMedica con revision de cierre incluida',
  pricing_model TEXT NOT NULL DEFAULT 'episode_safe_closure',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_care_episodes_patient_status
  ON public.care_episodes(patient_id, status, valid_until DESC);

CREATE INDEX IF NOT EXISTS idx_care_episodes_doctor_status
  ON public.care_episodes(doctor_id, status, valid_until DESC);

ALTER TABLE public.clinical_incidents
  ADD COLUMN IF NOT EXISTS care_episode_id UUID REFERENCES public.care_episodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_incidents_care_episode_id
  ON public.clinical_incidents(care_episode_id);

CREATE TABLE IF NOT EXISTS public.doctor_clinical_work_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  care_episode_id UUID REFERENCES public.care_episodes(id) ON DELETE SET NULL,
  clinical_incident_id UUID REFERENCES public.clinical_incidents(id) ON DELETE SET NULL,
  source_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  work_type TEXT NOT NULL CHECK (
    work_type IN ('ceeds_closure_review', 'async_patient_review', 'clinical_override_review')
  ),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  minutes_estimated INTEGER NOT NULL DEFAULT 10 CHECK (minutes_estimated >= 0),
  gross_internal_amount INTEGER NOT NULL DEFAULT 0 CHECK (gross_internal_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  funded_by TEXT NOT NULL DEFAULT 'included_consultation'
    CHECK (funded_by IN ('included_consultation', 'payer', 'subscription', 'platform', 'manual')),
  patient_billable BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (care_episode_id, clinical_incident_id, work_type)
);

CREATE INDEX IF NOT EXISTS idx_doctor_clinical_work_units_doctor_status
  ON public.doctor_clinical_work_units(doctor_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doctor_clinical_work_units_episode
  ON public.doctor_clinical_work_units(care_episode_id);

ALTER TABLE public.care_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_clinical_work_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can read own care episodes" ON public.care_episodes;
CREATE POLICY "Patients can read own care episodes"
  ON public.care_episodes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = care_episodes.patient_id
        AND patients.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Doctors can read own care episodes" ON public.care_episodes;
CREATE POLICY "Doctors can read own care episodes"
  ON public.care_episodes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctors
      WHERE doctors.id = care_episodes.doctor_id
        AND doctors.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Doctors can read own clinical work units" ON public.doctor_clinical_work_units;
CREATE POLICY "Doctors can read own clinical work units"
  ON public.doctor_clinical_work_units
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctors
      WHERE doctors.id = doctor_clinical_work_units.doctor_id
        AND doctors.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Patients can read non-billable work in own episodes" ON public.doctor_clinical_work_units;
CREATE POLICY "Patients can read non-billable work in own episodes"
  ON public.doctor_clinical_work_units
  FOR SELECT
  TO authenticated
  USING (
    patient_billable = false
    AND EXISTS (
      SELECT 1
      FROM public.patients
      WHERE patients.id = doctor_clinical_work_units.patient_id
        AND patients.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.care_episodes TO authenticated;
GRANT SELECT ON public.doctor_clinical_work_units TO authenticated;
GRANT ALL ON public.care_episodes TO service_role;
GRANT ALL ON public.doctor_clinical_work_units TO service_role;
