-- Non-destructive regression probe. Run with psql -v ON_ERROR_STOP=1.
-- All test data is temporary and rolled back, never inserted in clinical tables.
BEGIN;

CREATE TEMP TABLE role_guard_probe(role text NOT NULL) ON COMMIT DROP;
INSERT INTO role_guard_probe VALUES ('patient');
GRANT SELECT, UPDATE ON role_guard_probe TO authenticated;
CREATE TRIGGER probe_profile_role
  BEFORE UPDATE OF role ON role_guard_probe
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_authority();

SET LOCAL ROLE authenticated;
DO $block$
DECLARE error_message text;
BEGIN
  BEGIN
    UPDATE role_guard_probe SET role='platform_admin';
    RAISE EXCEPTION 'GUARD_NOT_TRIGGERED';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
    IF error_message <> 'Cannot change profile role from an unprivileged session' THEN
      RAISE EXCEPTION 'Unexpected privilege error: %', error_message;
    END IF;
  END;
END;
$block$;
RESET ROLE;

CREATE TEMP TABLE signup_guard_probe(
  id integer GENERATED ALWAYS AS IDENTITY,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
) ON COMMIT DROP;

CREATE TRIGGER probe_signup_role
  BEFORE INSERT ON signup_guard_probe
  FOR EACH ROW EXECUTE FUNCTION public.guard_signup_privileged_metadata();

INSERT INTO signup_guard_probe (raw_user_meta_data) VALUES
 ('{"role":"admin","user_role":"doctor"}'::jsonb),
 ('{"role":"platform_admin"}'::jsonb),
 ('{"user_role":"organization_admin"}'::jsonb),
 ('{"role":"patient"}'::jsonb),
 ('{"role":"doctor"}'::jsonb),
 ('{"role":"company"}'::jsonb);

DO $verify$
DECLARE observed text[];
BEGIN
 SELECT array_agg(raw_user_meta_data->>'role' ORDER BY id)
 INTO observed FROM signup_guard_probe;
 IF observed IS DISTINCT FROM ARRAY['patient','patient','patient','patient','doctor','company']::text[] THEN
   RAISE EXCEPTION 'Signup metadata guard failed: %', observed;
 END IF;
 IF EXISTS (SELECT 1 FROM signup_guard_probe WHERE id <= 3 AND raw_user_meta_data ? 'user_role') THEN
   RAISE EXCEPTION 'Untrusted admin user_role metadata remains';
 END IF;
END;
$verify$;

ROLLBACK;
