-- Disposable local database only: fixtures and their lifecycle changes always roll back.
BEGIN;
DO $guard$
BEGIN
  IF current_setting('autamedica.isolated_test',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Cleanup fixture test requires the disposable-database opt-in';
  END IF;
  IF EXISTS(SELECT 1 FROM public.conversation_sessions) THEN
    RAISE EXCEPTION 'Cleanup fixture test requires an empty conversation_sessions table';
  END IF;
END;
$guard$;

DO $fixtures$
DECLARE
  user_id_fixture uuid:=gen_random_uuid();
  patient_id_fixture uuid;
  stale_empty uuid:=gen_random_uuid();
  stale_event uuid:=gen_random_uuid();
  fresh_empty uuid:=gen_random_uuid();
  recent_event uuid:=gen_random_uuid();
  already_closed uuid:=gen_random_uuid();
  already_failed uuid:=gen_random_uuid();
  single_stale uuid:=gen_random_uuid();
  prefix text:='cleanup-fixture-'||gen_random_uuid()::text;
  result jsonb;
BEGIN
  IF has_function_privilege('anon','public.cleanup_stuck_conversation_sessions(text)','EXECUTE')
    OR has_function_privilege('authenticated','public.cleanup_stuck_conversation_sessions(text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.cleanup_stuck_conversation_sessions(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Cleanup scheduler privilege contract changed';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname='cleanup-stuck-sessions-every-30m'
    AND schedule='*/30 * * * *' AND username=current_user AND active
    AND command=$command$SELECT public.cleanup_stuck_conversation_sessions('60 minutes');$command$)<>1 THEN
    RAISE EXCEPTION 'Cleanup does not run directly through the existing SQL cron schedule';
  END IF;

  INSERT INTO auth.users(id,email) VALUES(user_id_fixture,prefix||'@example.invalid');
  SELECT id INTO patient_id_fixture FROM public.patients WHERE user_id=user_id_fixture;
  IF patient_id_fixture IS NULL THEN
    INSERT INTO public.patients(user_id) VALUES(user_id_fixture) RETURNING id INTO patient_id_fixture;
  END IF;

  INSERT INTO public.conversation_sessions(id,patient_id,case_id,channel,workflow_type,status,started_at,ended_at) VALUES
    (stale_empty,patient_id_fixture,prefix||'-stale-empty','voice','cleanup_test','active',now()-interval '2 hours',NULL),
    (stale_event,patient_id_fixture,prefix||'-stale-event','voice','cleanup_test','active',now()-interval '2 hours',NULL),
    (fresh_empty,patient_id_fixture,prefix||'-fresh','voice','cleanup_test','active',now()-interval '10 minutes',NULL),
    (recent_event,patient_id_fixture,prefix||'-recent','voice','cleanup_test','active',now()-interval '2 hours',NULL),
    (already_closed,patient_id_fixture,prefix||'-closed','voice','cleanup_test','closed',now()-interval '2 hours',now()-interval '90 minutes'),
    (already_failed,patient_id_fixture,prefix||'-failed','voice','cleanup_test','failed',now()-interval '2 hours',now()-interval '90 minutes');

  INSERT INTO public.conversation_events(session_id,case_id,patient_id,role,event_type,channel,raw_text,created_at) VALUES
    (stale_event,prefix||'-stale-event',patient_id_fixture,'system','fixture','voice','fixture',now()-interval '90 minutes'),
    (recent_event,prefix||'-recent',patient_id_fixture,'system','fixture','voice','fixture',now()-interval '5 minutes');

  result:=public.cleanup_stuck_conversation_sessions('60 minutes');
  IF (result->>'count')::int IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Batch cleanup did not count two stale UUID sessions'; END IF;
  IF EXISTS(SELECT 1 FROM public.conversation_sessions WHERE id IN(stale_empty,stale_event) AND (status<>'failed' OR ended_at IS DISTINCT FROM now())) THEN
    RAISE EXCEPTION 'Stale sessions were not closed with their history retained';
  END IF;
  IF EXISTS(SELECT 1 FROM public.conversation_sessions WHERE id IN(fresh_empty,recent_event) AND (status<>'active' OR ended_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Fresh or recently active session was changed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.conversation_sessions WHERE id=already_closed AND status='closed' AND ended_at=now()-interval '90 minutes')
    OR NOT EXISTS(SELECT 1 FROM public.conversation_sessions WHERE id=already_failed AND status='failed' AND ended_at=now()-interval '90 minutes') THEN
    RAISE EXCEPTION 'Already terminal session was changed';
  END IF;
  result:=public.cleanup_stuck_conversation_sessions('60 minutes');
  IF (result->>'count')::int IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Repeat cleanup was not idempotent'; END IF;

  INSERT INTO public.conversation_sessions(id,patient_id,case_id,channel,workflow_type,status,started_at)
    VALUES(single_stale,patient_id_fixture,prefix||'-single','voice','cleanup_test','active',now()-interval '2 hours');
  result:=public.cleanup_stuck_conversation_sessions('60 minutes');
  IF (result->>'count')::int IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Single UUID session cleanup failed'; END IF;
  IF (SELECT count(*) FROM public.conversation_sessions WHERE patient_id=patient_id_fixture)<>7 THEN
    RAISE EXCEPTION 'Cleanup deleted session history';
  END IF;
END;
$fixtures$;
SELECT 'PASS: native cleanup cron, private privileges, zero/one/many counts and fresh-session protection' AS result;
ROLLBACK;
