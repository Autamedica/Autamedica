-- Narrow PUBLIC policies whose predicates depend on an authenticated identity
-- or service role. Public catalogue/directory policies without identity checks
-- remain public.
DO $$
DECLARE
  p record;
  predicate text;
  target_roles text;
BEGIN
  FOR p IN
    SELECT schemaname,tablename,policyname,qual,with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND 'public'=ANY(roles)
      AND policyname NOT IN ('companies_select_public','doctors_select_public','catalog_select_active')
  LOOP
    predicate:=COALESCE(p.qual,'')||' '||COALESCE(p.with_check,'');
    IF predicate ~* 'auth\.uid|is_system_admin\(|is_doctor\(|is_patient\(|user_belongs_to_company\(|get_my_doctor_id\(|get_my_patient_id\(|can_access_p2p_chat_session\(|doctor_can_chat_with_patient\(|is_in_care_team\(|current_doctor_profile_id\(|current_patient_can_access_community_group\(|has_active_authorization\(|can_self_assign_care_team\(|current_pharmacist_id\(|current_pharmacist_pharmacy_ids\(' THEN
      IF predicate ~* 'auth\.role|auth\.jwt' THEN
        target_roles:='authenticated, service_role';
      ELSE
        target_roles:='authenticated';
      END IF;
    ELSIF predicate ~* 'auth\.role|auth\.jwt' THEN
      target_roles:='service_role';
    ELSE
      CONTINUE;
    END IF;
    EXECUTE format('ALTER POLICY %I ON %I.%I TO %s',
      p.policyname,p.schemaname,p.tablename,target_roles);
  END LOOP;
END $$;

-- Remove SELECT grants when no policy applies to the role. This does not
-- affect rows currently readable through an RLS policy.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND has_table_privilege('anon',c.oid,'SELECT')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname='public' AND p.tablename=c.relname
          AND p.cmd IN ('SELECT','ALL')
          AND ('anon'=ANY(p.roles) OR 'public'=ANY(p.roles))
      )
  LOOP EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM anon',r.relname); END LOOP;

  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND has_table_privilege('authenticated',c.oid,'SELECT')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname='public' AND p.tablename=c.relname
          AND p.cmd IN ('SELECT','ALL')
          AND ('authenticated'=ANY(p.roles) OR 'public'=ANY(p.roles))
      )
  LOOP EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM authenticated',r.relname); END LOOP;
END $$;
