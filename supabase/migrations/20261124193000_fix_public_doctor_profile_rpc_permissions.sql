-- Fix server-side execution of public.get_public_doctor_profile(UUID).
-- The RPC is SECURITY INVOKER (executed as service_role) and calls
-- app_private.is_doctor_dispatch_approved(uuid), so service_role needs USAGE
-- on schema app_private and EXECUTE on that predicate.
-- Also align the profile role filter with DOCTOR_ROLES so licensed,
-- dispatch-approved clinicians who hold an admin role remain eligible.
BEGIN;

GRANT USAGE ON SCHEMA app_private TO service_role;
GRANT EXECUTE ON FUNCTION app_private.is_doctor_dispatch_approved(uuid)
  TO service_role;

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
    AND p.role IN ('doctor', 'organization_admin', 'platform_admin', 'admin')
    AND d.public_profile_enabled IS TRUE
    AND app_private.is_doctor_dispatch_approved(d.id);
$public_profile$;

REVOKE ALL ON FUNCTION public.get_public_doctor_profile(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_doctor_profile(UUID)
  TO service_role;

COMMIT;
