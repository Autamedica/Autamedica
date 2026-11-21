-- Fix medical_records RLS for eventual patients (patients.user_id IS NULL)
-- and Brazilian on-demand dispatch patients (matched by patient_id / CPF).
--
-- Keeps public.is_clinically_approved_doctor() strictly enforced on every
-- clinical write path; never relaxes physician clinical approval gates.

BEGIN;

CREATE OR REPLACE FUNCTION public.doctor_has_patient_access_by_id(p_patient_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_doctor_id uuid;
  v_doctor_country text;
  v_patient_user_id uuid;
  v_patient_dni text;
  v_patient_country text;
BEGIN
  IF p_patient_id IS NULL OR NOT public.is_clinically_approved_doctor() THEN
    RETURN false;
  END IF;

  SELECT d.id, d.care_country
    INTO v_doctor_id, v_doctor_country
  FROM public.doctors d
  WHERE d.user_id = (SELECT auth.uid())
    AND d.active IS TRUE
  LIMIT 1;

  SELECT p.user_id, p.dni, p.care_country
    INTO v_patient_user_id, v_patient_dni, v_patient_country
  FROM public.patients p
  WHERE p.id = p_patient_id
    AND p.active IS TRUE
  LIMIT 1;

  IF v_doctor_id IS NULL OR NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_doctor_country IS NOT NULL
     AND v_patient_country IS NOT NULL
     AND v_doctor_country <> v_patient_country THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.patient_care_team pct
    WHERE pct.doctor_id = v_doctor_id
      AND pct.patient_id = p_patient_id
      AND pct.active IS TRUE
    UNION ALL
    SELECT 1 FROM public.doctor_patient dp
    WHERE dp.doctor_id = v_doctor_id
      AND dp.patient_id = p_patient_id
    UNION ALL
    SELECT 1 FROM public.appointments a
    WHERE a.doctor_id = v_doctor_id
      AND a.patient_id = p_patient_id
      AND a.deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM public.pharmacy_dispatch_requests r
    WHERE (r.assigned_doctor_id = v_doctor_id OR r.previous_doctor_id = v_doctor_id)
      AND (
        r.patient_id = p_patient_id
        OR (v_patient_user_id IS NOT NULL AND r.requested_by_user_id = v_patient_user_id)
        OR (v_patient_dni IS NOT NULL AND r.patient_dni = v_patient_dni)
      )
    UNION ALL
    SELECT 1 FROM public.patient_private_identities ppi
    WHERE ppi.doctor_id = v_doctor_id
      AND ppi.patient_id = p_patient_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.doctor_has_patient_access_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_has_patient_access_by_id(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.doctor_has_patient_access(patient_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_patient_id uuid;
BEGIN
  IF patient_user_id IS NULL OR NOT public.is_clinically_approved_doctor() THEN
    RETURN false;
  END IF;

  SELECT p.id INTO v_patient_id
  FROM public.patients p
  WHERE p.user_id = patient_user_id
    AND p.active IS TRUE
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.doctor_has_patient_access_by_id(v_patient_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.doctor_has_patient_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doctor_has_patient_access(uuid)
  TO authenticated, service_role;

ALTER POLICY "medical_records_insert_doctor" ON public.medical_records
  WITH CHECK (
    (deleted_at IS NULL)
    AND (
      (
        (SELECT public.is_clinically_approved_doctor())
        AND public.doctor_has_patient_access_by_id(medical_records.patient_id)
      )
      OR (SELECT public.is_system_admin())
    )
    AND (
      NOT public.is_doctor()
      OR public.is_system_admin()
      OR (SELECT public.is_clinically_approved_doctor())
    )
  );

ALTER POLICY "medical_records_select_scoped" ON public.medical_records
  USING (
    (deleted_at IS NULL)
    AND (
      EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = medical_records.doctor_id
          AND d.user_id = (SELECT auth.uid())
          AND (SELECT public.is_clinically_authorized_doctor_read_for_patient(medical_records.patient_id))
      )
      OR EXISTS (
        SELECT 1 FROM public.patient_care_team pct
        JOIN public.doctors d ON d.id = pct.doctor_id
        WHERE pct.patient_id = medical_records.patient_id
          AND d.user_id = (SELECT auth.uid())
          AND (SELECT public.is_clinically_authorized_doctor_read_for_patient(medical_records.patient_id))
      )
      OR EXISTS (
        SELECT 1 FROM public.patients p
        WHERE p.id = medical_records.patient_id
          AND p.user_id = (SELECT auth.uid())
      )
      OR public.doctor_has_patient_access_by_id(medical_records.patient_id)
      OR public.has_clinical_legacy_patient_read_grant(medical_records.patient_id)
      OR (SELECT public.is_system_admin())
    )
    AND (
      NOT public.is_doctor()
      OR public.is_system_admin()
      OR (SELECT public.is_clinically_authorized_doctor_read_for_patient(medical_records.patient_id))
    )
  );

COMMIT;
