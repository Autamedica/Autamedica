-- P0: SISA/REFEPS and CFM verification must be ADMIN-OWNED.
-- Existing profiles_update_self RLS allows users to edit profile fields;
-- never allow that policy to escalate clinical approval.
BEGIN;

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
        IF NEW.cfm_validation_status NOT IN ('pending')
           OR NEW.status = 'active'
        THEN
          RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY'
            USING ERRCODE='42501';
        END IF;
      ELSIF NEW.cfm_validation_status IS DISTINCT FROM OLD.cfm_validation_status
          OR NEW.status IS DISTINCT FROM OLD.status
      THEN
        RAISE EXCEPTION 'CLINICAL_VALIDATION_ADMIN_ONLY'
          USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$validation_guard$;

DROP TRIGGER IF EXISTS trg_profile_clinical_approval_admin_only
ON public.profiles;
CREATE TRIGGER trg_profile_clinical_approval_admin_only
BEFORE INSERT OR UPDATE OF sss_validation_status, sss_last_checked_at, active
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_self_clinical_approval();

DROP TRIGGER IF EXISTS trg_license_validation_admin_only
ON public.doctor_licenses;
CREATE TRIGGER trg_license_validation_admin_only
BEFORE INSERT OR UPDATE OF cfm_validation_status, status
ON public.doctor_licenses
FOR EACH ROW EXECUTE FUNCTION app_private.prevent_self_clinical_approval();

REVOKE ALL ON FUNCTION app_private.prevent_self_clinical_approval()
FROM PUBLIC, anon, authenticated;

COMMIT;
