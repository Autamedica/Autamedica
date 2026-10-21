-- Staging ONLY: synthetic Auth users + profile RLS negative-path integration test.
-- Requires security fixture installed in AutaMedica Staging. NEVER run on production.
-- All INSERT/UPDATE attempts are transactionally ROLLED BACK.
BEGIN;
INSERT INTO auth.users (id,instance_id,aud,role,email,raw_user_meta_data,raw_app_meta_data)
VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staging-a1.invalid@example.test','{"role":"platform_admin"}'::jsonb,'{}'::jsonb),
 ('10000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','staging-b2.invalid@example.test','{"role":"patient"}'::jsonb,'{}'::jsonb);

DO $sanitized$
DECLARE role_a text;
BEGIN
 SELECT raw_user_meta_data->>'role' INTO role_a
 FROM auth.users WHERE id='10000000-0000-0000-0000-0000000000a1';
 IF role_a IS DISTINCT FROM 'patient' THEN
   RAISE EXCEPTION 'Signup role sanitization failed: %',role_a;
 END IF;
END;
$sanitized$;

INSERT INTO public.profiles (user_id, role, email)
VALUES
 ('10000000-0000-0000-0000-0000000000a1','patient','staging-a1.invalid@example.test'),
 ('10000000-0000-0000-0000-0000000000b2','patient','staging-b2.invalid@example.test');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-0000000000a1',true);

DO $rls_check$
DECLARE visible_count int; other_count int; affected_count int; err text;
BEGIN
 SELECT count(*) INTO visible_count FROM public.profiles;
 SELECT count(*) INTO other_count FROM public.profiles
 WHERE user_id='10000000-0000-0000-0000-0000000000b2';
 IF visible_count<>1 OR other_count<>0 THEN
   RAISE EXCEPTION 'Profile RLS isolation failed visible=% other=%',visible_count,other_count;
 END IF;
 UPDATE public.profiles SET email='bad.invalid@example.test'
 WHERE user_id='10000000-0000-0000-0000-0000000000b2';
 GET DIAGNOSTICS affected_count=ROW_COUNT;
 IF affected_count<>0 THEN RAISE EXCEPTION 'Cross-user profile modification allowed'; END IF;

 BEGIN
   UPDATE public.profiles SET role='platform_admin'
   WHERE user_id='10000000-0000-0000-0000-0000000000a1';
   RAISE EXCEPTION 'Own-profile role escalation allowed';
 EXCEPTION WHEN insufficient_privilege THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   IF err <> 'Cannot change profile role from an unprivileged session' THEN
     RAISE EXCEPTION 'Unexpected privilege failure: %',err;
   END IF;
 END;
END;
$rls_check$;
RESET ROLE;
ROLLBACK;
