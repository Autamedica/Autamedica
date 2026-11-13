-- Preserve stale-session eligibility while counting UPDATE rows correctly.
CREATE OR REPLACE FUNCTION public.cleanup_stuck_conversation_sessions(threshold_interval text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
    updated_count integer;
    result jsonb;
BEGIN
    -- Update sessions that are 'active' but haven't had any event in the threshold interval
    -- OR those that started long ago and have NO events at all.
    WITH sessions_to_close AS (
        SELECT s.id
        FROM public.conversation_sessions s
        LEFT JOIN (
            -- Get the last event timestamp for each session
            SELECT session_id, max(created_at) as last_event_at
            FROM public.conversation_events
            GROUP BY session_id
        ) e ON e.session_id = s.id
        WHERE s.status = 'active'
          AND (
              (e.last_event_at IS NOT NULL AND e.last_event_at < now() - threshold_interval::interval)
              OR 
              (e.last_event_at IS NULL AND s.started_at < now() - threshold_interval::interval)
          )
    )
    UPDATE public.conversation_sessions
    SET 
        status = 'failed',
        ended_at = now()
    WHERE id IN (SELECT id FROM sessions_to_close);

    -- Return summary
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    result = jsonb_build_object(
        'count', updated_count,
        'timestamp', now()
    );

    RETURN result;
END;
$function$

;
REVOKE ALL ON FUNCTION public.cleanup_stuck_conversation_sessions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_conversation_sessions(text) TO service_role;

-- Let cron record the actual SQL outcome; no HTTP queue, DNS or secret dependency.
DO $schedule$
DECLARE existing_job bigint;
BEGIN
  SELECT jobid INTO existing_job FROM cron.job
  WHERE jobname='cleanup-stuck-sessions-every-30m' AND username=current_user;
  IF existing_job IS NULL THEN
    PERFORM cron.schedule('cleanup-stuck-sessions-every-30m','*/30 * * * *',$command$SELECT public.cleanup_stuck_conversation_sessions('60 minutes');$command$);
  ELSE
    PERFORM cron.alter_job(existing_job,command := $command$SELECT public.cleanup_stuck_conversation_sessions('60 minutes');$command$);
  END IF;
END;
$schedule$;
