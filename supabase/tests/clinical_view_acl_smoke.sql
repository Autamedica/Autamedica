-- Read-only privilege assertions for staging / production.
-- No clinical data is accessed and no table rows are changed.
DO $verify$
DECLARE bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relname IN (
      'clinical_gold_seasonal_metrics', 'telemedicine_sessions_canonical',
      'user_identifiers', 'clinic_financial_metrics'
    )
    AND (
      has_table_privilege('anon',c.oid,'SELECT')
      OR has_table_privilege('authenticated',c.oid,'SELECT')
      OR NOT has_table_privilege('service_role',c.oid,'SELECT')
    );
  IF bad_count <> 0 THEN
    RAISE EXCEPTION '% restricted clinical/admin views have unsafe grants',bad_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname='public' AND c.relname='v_patient_demographics'
      AND 'security_invoker=true' = ANY (coalesce(c.reloptions, ARRAY[]::text[]))
      AND NOT has_table_privilege('anon',c.oid,'SELECT')
      AND has_table_privilege('authenticated',c.oid,'SELECT')
      AND has_table_privilege('service_role',c.oid,'SELECT')
  ) THEN
    RAISE EXCEPTION 'Patient demographics view is not invoker-scoped or has incorrect grants';
  END IF;
END;
$verify$;
