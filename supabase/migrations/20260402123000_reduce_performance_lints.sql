-- Reduce performance lints that are safe to fix mechanically:
--   1. Add covering indexes for foreign keys flagged by Advisor
--   2. Remove duplicate indexes
--   3. Rewrite RLS policies to cache auth.* calls per statement

BEGIN;

-- ============================================================================
-- 1) Missing covering indexes for foreign keys
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_appointment_history_appointment_id
  ON public.appointment_history (appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appointment_id
  ON public.appointment_reminders (appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_doctor_id
  ON public.appointment_waitlist (doctor_id);

CREATE INDEX IF NOT EXISTS idx_appointment_waitlist_patient_id
  ON public.appointment_waitlist (patient_id);

CREATE INDEX IF NOT EXISTS idx_community_posts_author_id
  ON public.community_posts (author_id);

CREATE INDEX IF NOT EXISTS idx_company_members_profile_id
  ON public.company_members (profile_id);

CREATE INDEX IF NOT EXISTS idx_doctor_patient_patient_id
  ON public.doctor_patient (patient_id);

CREATE INDEX IF NOT EXISTS idx_org_members_profile_id
  ON public.org_members (profile_id);

CREATE INDEX IF NOT EXISTS idx_patient_derived_alerts_acknowledged_by_id
  ON public.patient_derived_alerts (acknowledged_by_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_organization_id
  ON public.user_roles (organization_id);

-- ============================================================================
-- 2) Duplicate indexes
-- ============================================================================

DROP INDEX IF EXISTS public.idx_appointments_doctor_time;
DROP INDEX IF EXISTS public.idx_appointments_patient_time;
DROP INDEX IF EXISTS public.calls_doctor_id_status_idx;
DROP INDEX IF EXISTS public.calls_patient_id_status_idx;
DROP INDEX IF EXISTS public.idx_telemedicine_sessions_room_id;

-- ============================================================================
-- 3) Rewrite RLS policy expressions that re-evaluate auth.* per row
-- ============================================================================

DO $$
DECLARE
  p record;
  new_qual text;
  new_with_check text;
  create_sql text;
  role_list text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND (
          qual LIKE '%auth.uid()%'
          OR qual LIKE '%auth.role()%'
          OR qual LIKE '%auth.jwt()%'
        ))
        OR
        (with_check IS NOT NULL AND (
          with_check LIKE '%auth.uid()%'
          OR with_check LIKE '%auth.role()%'
          OR with_check LIKE '%auth.jwt()%'
        ))
      )
  LOOP
    new_qual := p.qual;
    new_with_check := p.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      new_qual := replace(new_qual, 'auth.jwt()', '(select auth.jwt())');
    END IF;

    IF new_with_check IS NOT NULL THEN
      new_with_check := replace(new_with_check, 'auth.uid()', '(select auth.uid())');
      new_with_check := replace(new_with_check, 'auth.role()', '(select auth.role())');
      new_with_check := replace(new_with_check, 'auth.jwt()', '(select auth.jwt())');
    END IF;

    IF new_qual IS NOT DISTINCT FROM p.qual
       AND new_with_check IS NOT DISTINCT FROM p.with_check THEN
      CONTINUE;
    END IF;

    role_list := array_to_string(
      ARRAY(
        SELECT quote_ident(role_name)
        FROM unnest(p.roles) AS role_name
      ),
      ', '
    );

    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      p.policyname,
      p.schemaname,
      p.tablename
    );

    create_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      p.policyname,
      p.schemaname,
      p.tablename,
      p.permissive,
      p.cmd,
      role_list
    );

    IF new_qual IS NOT NULL THEN
      create_sql := create_sql || format(' USING (%s)', new_qual);
    END IF;

    IF new_with_check IS NOT NULL THEN
      create_sql := create_sql || format(' WITH CHECK (%s)', new_with_check);
    END IF;

    EXECUTE create_sql;
  END LOOP;
END
$$;

COMMIT;
