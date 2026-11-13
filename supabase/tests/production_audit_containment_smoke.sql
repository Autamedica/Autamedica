-- Read-only verification; no patient records are created or returned.
DO $test$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clinical_patient_conditions','clinical_symptom_observations'] LOOP
    IF has_table_privilege('anon','public.'||t,'SELECT') OR has_table_privilege('anon','public.'||t,'INSERT') THEN
      RAISE EXCEPTION 'Anonymous clinical access remains: %',t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND cmd='ALL' AND roles <> ARRAY['service_role']::name[]) THEN
      RAISE EXCEPTION 'Broad clinical policy remains: %',t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['clinical_incidents','clinical_incident_events','clinical_outbox_events'] LOOP
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(r,'public.'||t,'SELECT') OR has_table_privilege(r,'public.'||t,'INSERT') THEN
        RAISE EXCEPTION 'Direct clinical backend access remains: %, %',r,t;
      END IF;
    END LOOP;
    IF NOT has_table_privilege('service_role','public.'||t,'SELECT') OR NOT has_table_privilege('service_role','public.'||t,'INSERT') THEN
      RAISE EXCEPTION 'Backend access missing: %',t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['public.check_orphaned_profiles()','public.log_clinical_rule_evaluation_transaction(uuid,uuid,uuid,uuid,jsonb,text,text,text,uuid)'] LOOP
    IF has_function_privilege('anon',t,'EXECUTE') OR has_function_privilege('authenticated',t,'EXECUTE') OR NOT has_function_privilege('service_role',t,'EXECUTE') THEN
      RAISE EXCEPTION 'Invalid privileged RPC ACL: %',t;
    END IF;
  END LOOP;
END;
$test$;
