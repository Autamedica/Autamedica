-- Anonymous callers have no care-country identity and these RPCs return no
-- useful public payload for them. Keep authenticated and service-role access.
DO $$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_active_on_duty_doctors()',
    'public.get_doctor_busy_slots(uuid,date,date)',
    'public.get_duty_doctors_summary()',
    'public.get_pharmacy_tiers_status()'
  ] LOOP
    IF to_regprocedure(sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',to_regprocedure(sig));
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',to_regprocedure(sig));
    END IF;
  END LOOP;
END $$;
