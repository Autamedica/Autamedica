BEGIN;

-- ============================================================================
-- 1. Estado de Habilitação Profissional Brasil (1:1 por médico BR)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.doctor_brazil_credentials (
  doctor_id uuid PRIMARY KEY REFERENCES public.doctors(id) ON DELETE CASCADE,

  -- Etapa 3: Vinculación técnica en Memed Sinapse
  memed_link_status text NOT NULL DEFAULT 'not_linked'
    CHECK (memed_link_status IN (
      'not_linked',
      'linked_untested',
      'test_emission_verified',
      'suspended'
    )),
  memed_linked_at timestamptz,
  memed_test_prescription_id text CHECK (
    memed_test_prescription_id IS NULL
    OR length(btrim(memed_test_prescription_id)) BETWEEN 1 AND 100
  ),
  memed_professional_address_synced_at timestamptz,

  -- Etapa 4-5: Certificado Digital ICP-Brasil (incl. A3 gratuito del CFM)
  icp_brasil_status text NOT NULL DEFAULT 'not_started'
    CHECK (icp_brasil_status IN (
      'not_started',
      'requested_cfm_free',
      'self_reported_active',
      'verified',
      'expired',
      'revoked'
    )),
  icp_provider text CHECK (
    icp_provider IS NULL OR icp_provider IN (
      'cfm_cloud_a3',
      'vidaas',
      'birdid',
      'safeid',
      'other_icp_brasil'
    )
  ),
  icp_expires_at timestamptz,
  icp_evidence_path text,
  icp_verified_at timestamptz,
  icp_verified_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Etapa 6-7: Cota de Notificação de Receita B (B1 Azul) en VISA / SNCR
  sncr_b1_status text NOT NULL DEFAULT 'not_requested'
    CHECK (sncr_b1_status IN (
      'not_requested',
      'visa_requested',
      'self_reported_active',
      'verified',
      'depleted',
      'suspended'
    )),
  sncr_visa_uf text CHECK (
    sncr_visa_uf IS NULL
    OR sncr_visa_uf ~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$'
  ),
  sncr_visa_municipality text CHECK (
    sncr_visa_municipality IS NULL
    OR length(btrim(sncr_visa_municipality)) BETWEEN 2 AND 120
  ),
  sncr_b1_evidence_path text,
  sncr_quota_last_confirmed_at timestamptz,
  sncr_verified_at timestamptz,
  sncr_verified_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  sncr_review_notes text,

  -- Capacidades operativas efectivas (nunca auto-asignables por el médico)
  can_issue_simple_rx boolean NOT NULL DEFAULT false,
  can_issue_rce_ret_rx boolean NOT NULL DEFAULT false,
  can_issue_controlled_b1 boolean NOT NULL DEFAULT false,

  -- Auditoría de revisión
  last_reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  last_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Invariantes de consistencia
  CONSTRAINT doctor_br_cred_icp_verified_requires_auditor CHECK (
    icp_brasil_status <> 'verified'
    OR (icp_verified_at IS NOT NULL AND icp_verified_by IS NOT NULL)
  ),
  CONSTRAINT doctor_br_cred_sncr_verified_requires_auditor CHECK (
    sncr_b1_status <> 'verified'
    OR (sncr_verified_at IS NOT NULL AND sncr_verified_by IS NOT NULL AND sncr_visa_uf IS NOT NULL)
  ),
  CONSTRAINT doctor_br_cred_rce_requires_simple_and_icp CHECK (
    NOT can_issue_rce_ret_rx
    OR (can_issue_simple_rx AND icp_brasil_status = 'verified')
  ),
  CONSTRAINT doctor_br_cred_b1_requires_rce_and_sncr CHECK (
    NOT can_issue_controlled_b1
    OR (can_issue_rce_ret_rx AND sncr_b1_status = 'verified')
  )
);

CREATE INDEX IF NOT EXISTS idx_doctor_brazil_credentials_b1_ready
  ON public.doctor_brazil_credentials (can_issue_controlled_b1)
  WHERE can_issue_controlled_b1 = true;

CREATE INDEX IF NOT EXISTS idx_doctor_brazil_credentials_review_queue
  ON public.doctor_brazil_credentials (icp_brasil_status, sncr_b1_status)
  WHERE icp_brasil_status = 'self_reported_active'
     OR sncr_b1_status = 'self_reported_active';

-- ============================================================================
-- 2. Trazabilidad SNCR en public.memed_prescriptions
-- ============================================================================
ALTER TABLE public.memed_prescriptions
  ADD COLUMN IF NOT EXISTS sncr_notification_type text CHECK (
    sncr_notification_type IS NULL
    OR sncr_notification_type IN ('SIMPLE', 'RCE', 'RET', 'NRB', 'NRB2', 'NRA', 'NRR', 'NRT')
  ),
  ADD COLUMN IF NOT EXISTS sncr_notification_number text CHECK (
    sncr_notification_number IS NULL
    OR length(btrim(sncr_notification_number)) BETWEEN 4 AND 80
  ),
  ADD COLUMN IF NOT EXISTS sncr_status text NOT NULL DEFAULT 'not_applicable' CHECK (
    sncr_status IN (
      'not_applicable',
      'pending_verification',
      'issued_at_provider',
      'dispensed',
      'cancelled'
    )
  ),
  ADD COLUMN IF NOT EXISTS signature_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_memed_prescriptions_sncr_number
  ON public.memed_prescriptions (sncr_notification_number)
  WHERE sncr_notification_number IS NOT NULL;

-- ============================================================================
-- 3. Trigger anti-escalamiento
-- ============================================================================
CREATE OR REPLACE FUNCTION app_private.guard_doctor_brazil_credentials_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_doctor_country text;
BEGIN
  SELECT d.care_country INTO v_doctor_country
  FROM public.doctors d
  WHERE d.id = NEW.doctor_id;

  IF v_doctor_country IS DISTINCT FROM 'BR' THEN
    RAISE EXCEPTION 'BRAZIL_DOCTOR_COUNTRY_REQUIRED' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := pg_catalog.now();

  IF v_role = 'service_role' OR (v_role = '' AND session_user IN ('postgres', 'supabase_admin')) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = v_uid
      AND p.role IN ('platform_admin', 'admin')
      AND p.active = true
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.memed_link_status <> 'not_linked'
       OR NEW.memed_linked_at IS NOT NULL
       OR NEW.memed_test_prescription_id IS NOT NULL
       OR NEW.memed_professional_address_synced_at IS NOT NULL
       OR NEW.icp_brasil_status IN ('verified', 'expired', 'revoked')
       OR NEW.sncr_b1_status IN ('verified', 'suspended')
       OR NEW.can_issue_simple_rx IS TRUE
       OR NEW.can_issue_rce_ret_rx IS TRUE
       OR NEW.can_issue_controlled_b1 IS TRUE
       OR NEW.icp_verified_at IS NOT NULL
       OR NEW.icp_verified_by IS NOT NULL
       OR NEW.sncr_quota_last_confirmed_at IS NOT NULL
       OR NEW.sncr_verified_at IS NOT NULL
       OR NEW.sncr_verified_by IS NOT NULL
       OR NEW.sncr_review_notes IS NOT NULL
       OR NEW.last_reviewed_by IS NOT NULL
       OR NEW.last_reviewed_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.memed_link_status IS DISTINCT FROM OLD.memed_link_status
     OR NEW.memed_linked_at IS DISTINCT FROM OLD.memed_linked_at
     OR NEW.memed_test_prescription_id IS DISTINCT FROM OLD.memed_test_prescription_id
     OR NEW.memed_professional_address_synced_at IS DISTINCT FROM OLD.memed_professional_address_synced_at
     OR NEW.icp_verified_at IS DISTINCT FROM OLD.icp_verified_at
     OR NEW.icp_verified_by IS DISTINCT FROM OLD.icp_verified_by
     OR NEW.sncr_quota_last_confirmed_at IS DISTINCT FROM OLD.sncr_quota_last_confirmed_at
     OR NEW.sncr_verified_at IS DISTINCT FROM OLD.sncr_verified_at
     OR NEW.sncr_verified_by IS DISTINCT FROM OLD.sncr_verified_by
     OR NEW.sncr_review_notes IS DISTINCT FROM OLD.sncr_review_notes
     OR NEW.can_issue_simple_rx IS DISTINCT FROM OLD.can_issue_simple_rx
     OR NEW.can_issue_rce_ret_rx IS DISTINCT FROM OLD.can_issue_rce_ret_rx
     OR NEW.can_issue_controlled_b1 IS DISTINCT FROM OLD.can_issue_controlled_b1
     OR NEW.last_reviewed_by IS DISTINCT FROM OLD.last_reviewed_by
     OR NEW.last_reviewed_at IS DISTINCT FROM OLD.last_reviewed_at
     OR (NEW.icp_brasil_status IS DISTINCT FROM OLD.icp_brasil_status
         AND NEW.icp_brasil_status NOT IN ('not_started', 'requested_cfm_free', 'self_reported_active'))
     OR (NEW.sncr_b1_status IS DISTINCT FROM OLD.sncr_b1_status
         AND NEW.sncr_b1_status NOT IN ('not_requested', 'visa_requested', 'self_reported_active', 'depleted'))
  THEN
    RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.guard_doctor_brazil_credentials_authority() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_doctor_brazil_credentials_authority
  ON public.doctor_brazil_credentials;
CREATE TRIGGER trg_guard_doctor_brazil_credentials_authority
  BEFORE INSERT OR UPDATE ON public.doctor_brazil_credentials
  FOR EACH ROW
  EXECUTE FUNCTION app_private.guard_doctor_brazil_credentials_authority();

-- ============================================================================
-- 4. RLS estricto + ACL limpio
-- ============================================================================
ALTER TABLE public.doctor_brazil_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_brazil_credentials FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.doctor_brazil_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.doctor_brazil_credentials TO authenticated;
GRANT ALL ON TABLE public.doctor_brazil_credentials TO service_role;

DROP POLICY IF EXISTS doctor_brazil_credentials_select_own_or_admin ON public.doctor_brazil_credentials;
CREATE POLICY doctor_brazil_credentials_select_own_or_admin
  ON public.doctor_brazil_credentials
  FOR SELECT TO authenticated
  USING (
    doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND p.role IN ('platform_admin', 'admin')
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS doctor_brazil_credentials_insert_own_or_admin ON public.doctor_brazil_credentials;
CREATE POLICY doctor_brazil_credentials_insert_own_or_admin
  ON public.doctor_brazil_credentials
  FOR INSERT TO authenticated
  WITH CHECK (
    doctor_id IN (
      SELECT d.id FROM public.doctors d
      WHERE d.user_id = (SELECT auth.uid()) AND d.care_country = 'BR'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND p.role IN ('platform_admin', 'admin')
        AND p.active = true
    )
  );

DROP POLICY IF EXISTS doctor_brazil_credentials_update_own_or_admin ON public.doctor_brazil_credentials;
CREATE POLICY doctor_brazil_credentials_update_own_or_admin
  ON public.doctor_brazil_credentials
  FOR UPDATE TO authenticated
  USING (
    doctor_id IN (SELECT d.id FROM public.doctors d WHERE d.user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND p.role IN ('platform_admin', 'admin')
        AND p.active = true
    )
  )
  WITH CHECK (
    doctor_id IN (
      SELECT d.id FROM public.doctors d
      WHERE d.user_id = (SELECT auth.uid()) AND d.care_country = 'BR'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND p.role IN ('platform_admin', 'admin')
        AND p.active = true
    )
  );

-- ============================================================================
-- 5. Helper de elegibilidad para ruteo de guardia / prescripción BR
-- ============================================================================
CREATE OR REPLACE FUNCTION public.doctor_can_issue_br_rx(
  p_doctor_id uuid,
  p_rx_tier text DEFAULT 'simple'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors d
    JOIN public.doctor_brazil_credentials c ON c.doctor_id = d.id
    WHERE d.id = p_doctor_id
      AND d.active = true
      AND d.care_country = 'BR'
      AND d.license_type = 'CRM'
      AND CASE p_rx_tier
        WHEN 'simple' THEN c.can_issue_simple_rx
        WHEN 'rce_ret' THEN c.can_issue_rce_ret_rx
        WHEN 'controlled_b1' THEN c.can_issue_controlled_b1
        ELSE false
      END
  );
$$;

REVOKE ALL ON FUNCTION public.doctor_can_issue_br_rx(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_can_issue_br_rx(uuid, text) TO authenticated, service_role;

COMMIT;
