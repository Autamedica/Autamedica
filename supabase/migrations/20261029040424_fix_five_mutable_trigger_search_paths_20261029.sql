-- Harden trigger functions that exist in this database.
-- Some legacy trigger functions are present only in production, not in a clean local CI reset.
-- Guard each ALTER so replay is safe in both environments.
DO $$
DECLARE
  function_name text;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'api_keys_set_updated_at',
    'handle_updated_at',
    'set_clinical_case_state_updated_at',
    'touch_patient_wallets_updated_at',
    'update_doctor_heartbeat'
  ]
  LOOP
    IF to_regprocedure(format('public.%I()', function_name)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER FUNCTION public.%I() SET search_path = pg_catalog',
        function_name
      );
    END IF;
  END LOOP;
END
$$;
