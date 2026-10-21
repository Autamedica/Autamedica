-- PR #534 application auth changes depend on hotfix migrations mirrored in PR #536.
-- This is an explicit fail-closed prerequisite, not a substitute for staging tests.
DO $role_hardening_prerequisite$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'guard_profile_role_authority'
      AND tgenabled = 'O'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'guard_signup_privileged_metadata'
      AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'PR #534 blocked: prerequisite role guard triggers from PR #536 are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'execute_sql_temp',
        'grant_patient_wallet_credit',
        'grant_medical_record_authorization',
        'set_user_role',
        'set_portal_and_role',
        'guard_profile_role_authority',
        'guard_signup_privileged_metadata'
      )
      AND (
        has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'PR #534 blocked: privileged function is executable by an untrusted role';
  END IF;
END;
$role_hardening_prerequisite$;
