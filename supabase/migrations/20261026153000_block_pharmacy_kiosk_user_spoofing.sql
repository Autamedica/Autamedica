-- A pharmacy kiosk may be anonymous, but cannot impersonate another
-- authenticated user and then mutate that person's patient row via the
-- SECURITY DEFINER materialization trigger.
ALTER POLICY pharmacy_dispatch_requests_insert_kiosk_or_owner
  ON public.pharmacy_dispatch_requests
  TO anon, authenticated, service_role
  WITH CHECK (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR (
      auth.uid() IS NOT NULL
      AND requested_by_user_id = auth.uid()
    )
    OR (
      status = 'searching'
      AND requested_by_user_id IS NULL
      AND (patient_dni IS NOT NULL OR patient_cpf IS NOT NULL)
    )
  );

-- Defense in depth: validate the caller *before* materializing a patient.
-- Anonymous kiosks continue to work with NULL requested_by_user_id.
CREATE OR REPLACE FUNCTION public.assign_dispatch_patient_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $guard$
BEGIN
  IF NEW.requested_by_user_id IS NOT NULL
    AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
    AND (
      auth.uid() IS NULL
      OR auth.uid() IS DISTINCT FROM NEW.requested_by_user_id
    )
  THEN
    RAISE EXCEPTION 'dispatch_request_identity_denied' USING ERRCODE = '42501';
  END IF;

  NEW.patient_id := public.ensure_dispatch_patient(
    NEW.requested_by_user_id,
    NEW.patient_dni,
    NEW.patient_cpf
  );
  RETURN NEW;
END;
$guard$;
