-- Public editorial doctor profiles and jurisdictional testimonial governance.
-- Additive and repeatable: no existing patient/doctor records are rewritten.
BEGIN;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS clinical_focus_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS professional_experience JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS academic_activity JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_profile_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_profile_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_profile_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS public_profile_consent_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_profile_consent_version TEXT;

-- Legacy consent columns remain nullable for compatibility, but no longer gate publication.
ALTER TABLE public.doctors
  DROP CONSTRAINT IF EXISTS doctors_public_profile_consent_required;

ALTER TABLE public.doctors
  DROP CONSTRAINT IF EXISTS doctors_public_profile_json_arrays;
ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_public_profile_json_arrays
  CHECK (
    jsonb_typeof(clinical_focus_areas) = 'array'
    AND jsonb_typeof(professional_experience) = 'array'
    AND jsonb_typeof(academic_activity) = 'array'
  );

COMMENT ON COLUMN public.doctors.public_profile_enabled IS
  'Doctor-controlled public profile visibility. Disabled by default; activation is timestamped and audited.';
COMMENT ON COLUMN public.doctors.public_profile_published_at IS
  'Timestamp of the most recent transition to public visibility.';
COMMENT ON COLUMN public.doctors.public_profile_updated_by IS
  'Authenticated doctor or platform administrator who last changed public profile visibility.';

-- Existing country governance rows become the independently configurable feature flags.
ALTER TABLE public.platform_operational_domains
  ADD COLUMN IF NOT EXISTS public_doctor_testimonials_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Automatic timestamp and audit trail for doctor/admin visibility changes.
CREATE OR REPLACE FUNCTION public.audit_doctor_public_profile_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.public_profile_enabled IS DISTINCT FROM OLD.public_profile_enabled THEN
    NEW.public_profile_updated_at := now();
    IF NEW.public_profile_enabled IS TRUE THEN
      NEW.public_profile_published_at := now();
    END IF;

    INSERT INTO public.audit_logs(user_id, action, resource_type, resource_id, metadata)
    VALUES (
      NEW.public_profile_updated_by,
      'doctor_public_profile_visibility_changed',
      'doctors',
      NEW.id,
      jsonb_build_object(
        'previous_enabled', OLD.public_profile_enabled,
        'enabled', NEW.public_profile_enabled,
        'published_at', NEW.public_profile_published_at,
        'changed_at', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_doctor_public_profile_visibility()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_doctor_public_profile_visibility()
  TO service_role;

DROP TRIGGER IF EXISTS trg_audit_doctor_public_profile_visibility ON public.doctors;
CREATE TRIGGER trg_audit_doctor_public_profile_visibility
  BEFORE UPDATE OF public_profile_enabled ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_doctor_public_profile_visibility();

-- Safe public read model. Execution remains restricted to the server-side service role.
CREATE OR REPLACE FUNCTION public.get_public_doctor_profile(p_doctor_id UUID)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $public_profile$
  SELECT jsonb_build_object(
    'id', d.id,
    'care_country', d.care_country,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'avatar_url', p.avatar_url,
    'specialty', d.specialty,
    'subspecialty', d.subspecialty,
    'bio', d.bio,
    'years_experience', d.years_experience,
    'education', COALESCE(d.education, '[]'::jsonb),
    'certifications', COALESCE(d.certifications, '[]'::jsonb),
    'clinical_focus_areas', COALESCE(d.clinical_focus_areas, '[]'::jsonb),
    'professional_experience', COALESCE(d.professional_experience, '[]'::jsonb),
    'academic_activity', COALESCE(d.academic_activity, '[]'::jsonb),
    'languages', COALESCE(d.languages, '[]'::jsonb),
    'rqe_number', CASE WHEN d.care_country = 'BR' THEN NULLIF(BTRIM(d.rqe_number), '') END,
    'uf_brazil', CASE WHEN d.care_country = 'BR' THEN d.uf_brazil END,
    'licenses', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('license_type', l.license_type, 'license_number', l.license_number)
          ORDER BY l.license_type, l.license_number
        ),
        '[]'::jsonb
      )
      FROM public.doctor_licenses l
      WHERE l.doctor_id = d.id
        AND l.status = 'active'
        AND (
          (d.care_country = 'AR' AND l.license_type IN ('MN', 'MP'))
          OR
          (d.care_country = 'BR' AND l.license_type = 'CRM' AND l.cfm_validation_status = 'valid')
        )
    ),
    'testimonials', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object('comment', r.comment, 'created_at', r.created_at)
          ORDER BY r.created_at DESC
        ),
        '[]'::jsonb
      )
      FROM public.doctor_reviews r
      JOIN public.appointments a ON a.id = r.appointment_id
      WHERE r.doctor_id = d.id
        AND r.status::text = 'approved'
        AND a.status::text = 'completed'
        AND NULLIF(BTRIM(r.comment), '') IS NOT NULL
    )
  )
  FROM public.doctors d
  JOIN public.profiles p ON p.user_id = d.user_id
  WHERE d.id = p_doctor_id
    AND d.active IS TRUE
    AND d.care_country IN ('AR', 'BR')
    AND p.active IS TRUE
    AND p.deleted_at IS NULL
    AND p.role = 'doctor'
    AND d.public_profile_enabled IS TRUE
    AND app_private.is_doctor_dispatch_approved(d.id);
$public_profile$;

-- Platform owner can switch each country's testimonial section independently.
CREATE OR REPLACE FUNCTION public.admin_set_public_doctor_testimonials(
  p_scope_key TEXT,
  p_enabled BOOLEAN,
  p_reason TEXT,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_previous BOOLEAN;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_actor_id
      AND active IS TRUE
      AND role IN ('admin', 'platform_admin', 'organization_admin')
  ) THEN
    RAISE EXCEPTION 'active_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_scope_key NOT IN ('AR', 'BR') OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_testimonial_flag_scope_or_value' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 8 OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'audit_reason_required' USING ERRCODE = '22023';
  END IF;

  SELECT public_doctor_testimonials_enabled
    INTO v_previous
    FROM public.platform_operational_domains
    WHERE scope_key = p_scope_key
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'governance_scope_not_found';
  END IF;

  UPDATE public.platform_operational_domains
  SET public_doctor_testimonials_enabled = p_enabled,
      updated_by = p_actor_id,
      updated_at = v_now,
      reason = btrim(p_reason),
      state_audit = COALESCE(state_audit, '{}'::jsonb) || jsonb_build_object(
        'public_doctor_testimonials_enabled',
        jsonb_build_object(
          'previous', v_previous,
          'enabled', p_enabled,
          'approved_by', p_actor_id,
          'reason', btrim(p_reason),
          'timestamp', v_now
        )
      )
  WHERE scope_key = p_scope_key;

  INSERT INTO public.audit_logs(user_id, action, resource_type, metadata)
  VALUES (
    p_actor_id,
    'public_doctor_testimonials_flag_changed',
    'platform_operational_domains',
    jsonb_build_object(
      'scope_key', p_scope_key,
      'previous_enabled', v_previous,
      'enabled', p_enabled,
      'reason', btrim(p_reason),
      'timestamp', v_now
    )
  );

  RETURN jsonb_build_object('success', true, 'scope_key', p_scope_key, 'enabled', p_enabled, 'updated_at', v_now);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_public_doctor_testimonials(TEXT, BOOLEAN, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_public_doctor_testimonials(TEXT, BOOLEAN, TEXT, UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.get_public_doctor_profile(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_doctor_profile(UUID)
  TO service_role;

COMMIT;
