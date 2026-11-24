-- Public, editorial doctor profiles. No table is added: the existing doctors,
-- profiles and doctor_licenses records remain the source of truth.
BEGIN;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS clinical_focus_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS professional_experience JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS academic_activity JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_profile_consent_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS public_profile_consent_version TEXT;

ALTER TABLE public.doctors
  DROP CONSTRAINT IF EXISTS doctors_public_profile_consent_required;
ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_public_profile_consent_required
  CHECK (
    public_profile_enabled IS FALSE
    OR (
      public_profile_consent_confirmed_at IS NOT NULL
      AND NULLIF(BTRIM(public_profile_consent_version), '') IS NOT NULL
    )
  );

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
  'Controls public SSR profile visibility. Defaults false; enabled only after a doctor confirms publication consent.';
COMMENT ON COLUMN public.doctors.public_profile_consent_confirmed_at IS
  'Timestamp at which the doctor confirmed publication consent in the AutaMedica profile editor.';
COMMENT ON COLUMN public.doctors.public_profile_consent_version IS
  'Version of the public-profile consent wording accepted by the doctor.';

-- Safe read model: only professional fields are returned. This function is
-- callable only from the server-side service role; anon/authenticated retain
-- no direct access to doctors/profiles/doctor_licenses.
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
    'license_type', d.license_type,
    'rqe_number', CASE WHEN d.care_country = 'BR' THEN NULLIF(BTRIM(d.rqe_number), '') END,
    'uf_brazil', CASE WHEN d.care_country = 'BR' THEN d.uf_brazil END,
    'enrollment_jurisdiction', CASE WHEN d.care_country = 'AR' THEN d.enrollment_jurisdiction END,
    'licenses', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'license_type', l.license_type,
            'license_number', l.license_number
          )
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
    AND d.public_profile_consent_confirmed_at IS NOT NULL
    AND NULLIF(BTRIM(d.public_profile_consent_version), '') IS NOT NULL
    AND app_private.is_doctor_dispatch_approved(d.id);
$public_profile$;

REVOKE ALL ON FUNCTION public.get_public_doctor_profile(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_doctor_profile(UUID)
  TO service_role;

COMMIT;
