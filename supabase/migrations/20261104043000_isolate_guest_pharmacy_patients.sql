-- Pharmacy dispatch AR/BR: protect existing clinical records from guest DNI/CPF matching.
-- A document number supplied at a kiosk is NOT evidence that the caller owns an
-- existing patient chart. Guests receive a new visit-scoped patient placeholder;
-- document/signature issuance must apply independent clinician verification.
--
-- Roll out only after web/Android send explicit care_country and test against
-- a production-equivalent staging database. Does not backfill historical rows.
BEGIN;

CREATE OR REPLACE FUNCTION public.assign_dispatch_patient_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_patient_id uuid;
  v_country text;
BEGIN
  IF NEW.requested_by_user_id IS NOT NULL
    AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND (
      auth.uid() IS NULL
      OR auth.uid() IS DISTINCT FROM NEW.requested_by_user_id
    )
  THEN
    RAISE EXCEPTION 'dispatch_request_identity_denied' USING ERRCODE='42501';
  END IF;

  IF NEW.requested_by_user_id IS NOT NULL THEN
    -- Only the authenticated account's actual patient row may be reused.
    -- Never overwrite its DNI/CPF using a request body.
    SELECT p.id, p.care_country
      INTO v_patient_id, v_country
    FROM public.patients p
    WHERE p.user_id = NEW.requested_by_user_id
      AND p.active IS TRUE
    LIMIT 1;

    IF v_patient_id IS NULL OR v_country IS NULL THEN
      RAISE EXCEPTION 'care_country_or_patient_profile_required' USING ERRCODE='42501';
    END IF;
    IF NEW.care_country IS NOT NULL AND NEW.care_country IS DISTINCT FROM v_country THEN
      RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
    END IF;
    NEW.care_country := v_country;
    NEW.patient_id := v_patient_id;
  ELSE
    -- Guest request: a person knowing a DNI/CPF may NOT attach the visit to
    -- another person's existing medical record, even if the country matches.
    IF NEW.care_country NOT IN ('AR', 'BR') OR NEW.care_country IS NULL THEN
      RAISE EXCEPTION 'care_country_required' USING ERRCODE='42501';
    END IF;

    INSERT INTO public.patients (user_id, dni, cpf, care_country, active, timezone)
    VALUES (
      NULL, NULL, NULL, NEW.care_country, TRUE,
      CASE WHEN NEW.care_country='BR'
        THEN 'America/Sao_Paulo'
        ELSE 'America/Argentina/Buenos_Aires' END
    )
    RETURNING id INTO v_patient_id;

    NEW.patient_id := v_patient_id;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_dispatch_patient_id() FROM PUBLIC, anon, authenticated;

-- Guest dispatch creation must go through the validated server API, not direct
-- anonymous REST INSERTs. Authenticated patients may submit only as themselves.
REVOKE INSERT ON public.pharmacy_dispatch_requests FROM anon;
DROP POLICY IF EXISTS pharmacy_dispatch_requests_insert_kiosk_or_owner
  ON public.pharmacy_dispatch_requests;
CREATE POLICY pharmacy_dispatch_requests_insert_kiosk_or_owner
  ON public.pharmacy_dispatch_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND requested_by_user_id = (SELECT auth.uid())
  );

COMMIT;
