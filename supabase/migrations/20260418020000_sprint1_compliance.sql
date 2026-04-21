-- ============================================================
-- Sprint 1 — Compliance foundations para Insomnio + TDAH
-- RENPRE + Consent + Signature certs + Physical recipe column
-- ============================================================

-- 1. RENPRE registrations por médico
CREATE TABLE IF NOT EXISTS public.renpre_registrations (
  doctor_id            uuid PRIMARY KEY REFERENCES public.doctors(id) ON DELETE CASCADE,
  renpre_number        text NOT NULL,
  certificate_pdf_url  text,
  valid_from           date NOT NULL,
  valid_until          date NOT NULL,
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'verified', 'expired', 'rejected')),
  verified_at          timestamptz,
  verified_by_admin_id uuid,
  rejection_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT renpre_dates_valid CHECK (valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_renpre_status ON public.renpre_registrations (status, valid_until);

COMMENT ON TABLE public.renpre_registrations IS
  'Registro Nacional de Precursores Químicos (RENPRE) de cada médico habilitado para prescribir Lista II-IV';

ALTER TABLE public.renpre_registrations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_renpre_updated_at ON public.renpre_registrations;
CREATE TRIGGER trg_renpre_updated_at
  BEFORE UPDATE ON public.renpre_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Signature certificates (para firma digital AC externa cuando esté)
CREATE TABLE IF NOT EXISTS public.signature_certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id           uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  ac_provider         text NOT NULL
                      CHECK (ac_provider IN ('lakaut', 'encode', 'digicert_ar', 'afip', 'onti', 'self_signed')),
  cert_fingerprint    text NOT NULL,
  cert_subject        text NOT NULL,
  cert_valid_from     timestamptz NOT NULL,
  cert_valid_until    timestamptz NOT NULL,
  cert_status         text NOT NULL DEFAULT 'active'
                      CHECK (cert_status IN ('active', 'revoked', 'expired')),
  signature_method    text NOT NULL DEFAULT 'electronic_simple'
                      CHECK (signature_method IN ('ac_external', 'electronic_simple')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, cert_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_sigcert_doctor_active
  ON public.signature_certificates (doctor_id, cert_status, cert_valid_until);

COMMENT ON TABLE public.signature_certificates IS
  'Certificados de firma del médico. signature_method=ac_external habilita firma digital Ley 25.506';

ALTER TABLE public.signature_certificates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_sigcert_updated_at ON public.signature_certificates;
CREATE TRIGGER trg_sigcert_updated_at
  BEFORE UPDATE ON public.signature_certificates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Informed consents (general + psiquiatra + telemedicina + data)
CREATE TABLE IF NOT EXISTS public.informed_consents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  consent_type       text NOT NULL
                     CHECK (consent_type IN (
                       'general',
                       'psychiatry_controlled',
                       'telemedicine',
                       'data_sharing_insurance',
                       'data_sharing_anmat'
                     )),
  template_version   text NOT NULL,
  pdf_url            text,
  signed_at          timestamptz NOT NULL DEFAULT now(),
  ip_address         inet,
  user_agent         text,
  signature_hash     text NOT NULL,
  accepted_sections  jsonb NOT NULL DEFAULT '[]'::jsonb,
  revoked_at         timestamptz,
  revoked_reason     text,
  expires_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_patient_type_active
  ON public.informed_consents (patient_id, consent_type, revoked_at, expires_at);

COMMENT ON TABLE public.informed_consents IS
  'Consentimientos informados firmados por pacientes. psychiatry_controlled requerido para Lista II-IV';

ALTER TABLE public.informed_consents ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_consent_updated_at ON public.informed_consents;
CREATE TRIGGER trg_consent_updated_at
  BEFORE UPDATE ON public.informed_consents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Columnas adicionales en prescriptions
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS physical_pdf_url text,
  ADD COLUMN IF NOT EXISTS signature_method text DEFAULT 'electronic_simple'
    CHECK (signature_method IN ('ac_external', 'electronic_simple')),
  ADD COLUMN IF NOT EXISTS drug_category text
    CHECK (drug_category IN ('narcotic', 'psychotropic', 'default')),
  ADD COLUMN IF NOT EXISTS blocked_reason text;

COMMENT ON COLUMN public.prescriptions.physical_pdf_url IS
  'PDF imprimible para jurisdicciones que aún requieren recetario oficial físico';
COMMENT ON COLUMN public.prescriptions.drug_category IS
  'Categoría del fármaco prescrito (narcotic=Lista II, psychotropic=Lista III-IV, default=otros)';
COMMENT ON COLUMN public.prescriptions.blocked_reason IS
  'Si la emisión fue bloqueada por PrescriptionGuards, código del bloqueo';

-- 5. RLS policies mínimas (service_role tiene todo, authenticated lee lo suyo)
DROP POLICY IF EXISTS "service_role_all_renpre" ON public.renpre_registrations;
CREATE POLICY "service_role_all_renpre" ON public.renpre_registrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_sigcert" ON public.signature_certificates;
CREATE POLICY "service_role_all_sigcert" ON public.signature_certificates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_consent" ON public.informed_consents;
CREATE POLICY "service_role_all_consent" ON public.informed_consents
  FOR ALL TO service_role USING (true) WITH CHECK (true);
