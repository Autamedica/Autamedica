-- Add optional consultation CTA visibility toggle and custom editorial headline
-- to public doctor profiles, defaulting executive/admin clinician profiles to
-- institutional showcase mode without a public booking CTA.
BEGIN;

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS public_profile_accepts_consultations BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS public_profile_headline TEXT;

ALTER TABLE public.doctors
  DROP CONSTRAINT IF EXISTS doctors_public_profile_headline_length;
ALTER TABLE public.doctors
  ADD CONSTRAINT doctors_public_profile_headline_length
  CHECK (public_profile_headline IS NULL OR char_length(btrim(public_profile_headline)) <= 160);

COMMENT ON COLUMN public.doctors.public_profile_accepts_consultations IS
  'Controls whether the public doctor profile displays consultation booking CTAs. Institutional/director profiles may disable booking while keeping verified credentials visible.';
COMMENT ON COLUMN public.doctors.public_profile_headline IS
  'Optional editorial headline or executive role displayed below the doctor name on public profiles.';

UPDATE public.doctors d
SET public_profile_accepts_consultations = FALSE
FROM public.profiles p
WHERE p.user_id = d.user_id
  AND p.role IN ('platform_admin', 'admin', 'organization_admin')
  AND d.public_profile_accepts_consultations IS TRUE;

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
    'public_profile_accepts_consultations', d.public_profile_accepts_consultations,
    'public_profile_headline', NULLIF(BTRIM(d.public_profile_headline), ''),
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
    AND p.role IN ('doctor', 'organization_admin', 'platform_admin', 'admin')
    AND d.public_profile_enabled IS TRUE
    AND app_private.is_doctor_dispatch_approved(d.id);
$public_profile$;

REVOKE ALL ON FUNCTION public.get_public_doctor_profile(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_doctor_profile(UUID)
  TO service_role;

COMMIT;
