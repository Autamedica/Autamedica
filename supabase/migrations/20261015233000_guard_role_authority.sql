-- PR1: deny role escalation through profiles and self-service Auth signup.
-- Must be deployed and verified before API changes go live.
CREATE OR REPLACE FUNCTION public.guard_profile_role_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND NEW.role::text NOT IN ('patient', 'doctor', 'pharmacist', 'company', 'company_admin') THEN
      RAISE EXCEPTION 'Privileged role requires trusted provisioning' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot change profile role from an unprivileged session' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_role_authority ON public.profiles;
CREATE TRIGGER guard_profile_role_authority
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_authority();

-- Existing handle_new_user() trusts raw_user_meta_data.role at signup.
-- BEFORE INSERT sanitizes administrative values before the provisioning trigger.
CREATE OR REPLACE FUNCTION public.guard_signup_privileged_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_role text;
BEGIN
  requested_role := lower(trim(coalesce(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_user_meta_data ->> 'user_role',
    'patient'
  )));
  IF requested_role IN ('admin', 'platform_admin', 'organization_admin') THEN
    NEW.raw_user_meta_data := (
      jsonb_set(coalesce(NEW.raw_user_meta_data, '{}'::jsonb), '{role}', '"patient"'::jsonb, true)
      - 'user_role'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_signup_privileged_metadata ON auth.users;
CREATE TRIGGER guard_signup_privileged_metadata
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_signup_privileged_metadata();
