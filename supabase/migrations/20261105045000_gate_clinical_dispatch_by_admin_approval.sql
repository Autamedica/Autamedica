-- Central clinical authorization predicate for AutaMedica Guard.
-- Technical account activation is NOT administrator approval.
-- AR: Admin SISA/REFEPS validation valid/exempt + active MN/MP credential.
-- BR: Independently validated active CRM licence (CFM), no reliance on SISA.
-- This internal predicate is used by all entrypoints (dispatcher / RPCs / radar).
BEGIN;

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
