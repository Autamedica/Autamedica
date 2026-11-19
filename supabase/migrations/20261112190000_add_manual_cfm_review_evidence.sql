-- Manual CFM credential review: approval requires a private evidence file and an accountable reviewer.
BEGIN;

ALTER TABLE public.doctor_licenses
  ADD COLUMN IF NOT EXISTS cfm_evidence_path TEXT,
  ADD COLUMN IF NOT EXISTS cfm_review_notes TEXT,
  ADD COLUMN IF NOT EXISTS cfm_reviewed_by UUID, -- retain reviewer identity as audit history if the account is later removed
  ADD COLUMN IF NOT EXISTS cfm_reviewed_at TIMESTAMPTZ;

-- NOT VALID preserves existing historical rows while enforcing the rule for new/updated rows.
ALTER TABLE public.doctor_licenses
  DROP CONSTRAINT IF EXISTS doctor_licenses_cfm_valid_requires_manual_evidence;
ALTER TABLE public.doctor_licenses
  ADD CONSTRAINT doctor_licenses_cfm_valid_requires_manual_evidence
  CHECK (
    cfm_validation_status <> 'valid'
    OR (
      status = 'active'
      AND NULLIF(BTRIM(cfm_evidence_path), '') IS NOT NULL
      AND char_length(BTRIM(COALESCE(cfm_review_notes, ''))) >= 10
      AND cfm_reviewed_by IS NOT NULL
      AND cfm_reviewed_at IS NOT NULL
      AND cfm_last_checked_at IS NOT NULL
    )
  ) NOT VALID;

-- Only the server-side service role may write validation outcomes or their evidence metadata.
CREATE OR REPLACE FUNCTION app_private.prevent_self_clinical_approval()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO ''
AS $validation_guard$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF TG_TABLE_NAME='profiles' THEN
      IF TG_OP='INSERT' THEN
        IF NEW.sss_validation_status IS NOT NULL
           AND NEW.sss_validation_status NOT IN ('pending','pending_review')
        THEN
          RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY'
            USING ERRCODE='42501';
        END IF;
        IF NEW.sss_last_checked_at IS NOT NULL THEN
          RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY'
            USING ERRCODE='42501';
        END IF;
      ELSIF NEW.sss_validation_status IS DISTINCT FROM OLD.sss_validation_status
          OR NEW.sss_last_checked_at IS DISTINCT FROM OLD.sss_last_checked_at
          OR NEW.active IS DISTINCT FROM OLD.active
      THEN
        RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY'
          USING ERRCODE='42501';
      END IF;
    ELSIF TG_TABLE_NAME='doctor_licenses' THEN
      IF TG_OP='INSERT' THEN
        IF NEW.cfm_validation_status IS DISTINCT FROM 'pending'
           OR NEW.status = 'active'
           OR NEW.cfm_evidence_path IS NOT NULL
           OR NEW.cfm_review_notes IS NOT NULL
           OR NEW.cfm_reviewed_by IS NOT NULL
           OR NEW.cfm_reviewed_at IS NOT NULL
        THEN
          RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY'
            USING ERRCODE='42501';
        END IF;
      ELSIF NEW.cfm_validation_status IS DISTINCT FROM OLD.cfm_validation_status
          OR NEW.status IS DISTINCT FROM OLD.status
          OR NEW.cfm_evidence_path IS DISTINCT FROM OLD.cfm_evidence_path
          OR NEW.cfm_review_notes IS DISTINCT FROM OLD.cfm_review_notes
          OR NEW.cfm_reviewed_by IS DISTINCT FROM OLD.cfm_reviewed_by
          OR NEW.cfm_reviewed_at IS DISTINCT FROM OLD.cfm_reviewed_at
      THEN
        RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY'
          USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$validation_guard$;

DROP TRIGGER IF EXISTS trg_license_validation_admin_only ON public.doctor_licenses;
CREATE TRIGGER trg_license_validation_admin_only
BEFORE INSERT OR UPDATE OF
  cfm_validation_status,
  status,
  cfm_evidence_path,
  cfm_review_notes,
  cfm_reviewed_by,
  cfm_reviewed_at
ON public.doctor_licenses
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_self_clinical_approval();

-- Private storage bucket: uploads and signed reads are performed only by the admin API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'doctor-credential-evidence',
  'doctor-credential-evidence',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- Enforce documentary proof at the central dispatch gate as well.
CREATE OR REPLACE FUNCTION app_private.is_doctor_dispatch_approved(p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $eligibility$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctors d
    WHERE d.id = p_doctor_id
      AND d.active IS TRUE
      AND d.care_country IN ('AR','BR')
      AND NULLIF(btrim(d.license_number),'') IS NOT NULL
      AND upper(btrim(d.license_number)) !~ '^PENDING'
      AND (
        (
          d.care_country='AR'
          AND d.license_type IN ('MN','MP')
          AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id=d.user_id
              AND p.active IS TRUE
              AND p.sss_validation_status IN ('valid','exempt')
          )
          AND EXISTS (
            SELECT 1 FROM public.doctor_licenses l
            WHERE l.doctor_id=d.id
              AND l.status='active'
              AND l.license_type IN ('MN','MP')
          )
        )
        OR
        (
          d.care_country='BR'
          AND d.license_type='CRM'
          AND EXISTS (
            SELECT 1 FROM public.doctor_licenses l
            WHERE l.doctor_id=d.id
              AND l.status='active'
              AND l.license_type='CRM'
              AND l.cfm_validation_status='valid'
              AND NULLIF(btrim(l.cfm_evidence_path), '') IS NOT NULL
              AND char_length(btrim(coalesce(l.cfm_review_notes, ''))) >= 10
              AND l.cfm_reviewed_by IS NOT NULL
              AND l.cfm_reviewed_at IS NOT NULL
              AND l.cfm_last_checked_at IS NOT NULL
          )
        )
      )
  );
$eligibility$;

REVOKE ALL ON FUNCTION app_private.is_doctor_dispatch_approved(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_doctor_dispatch_approved(uuid)
  TO service_role;

COMMIT;
