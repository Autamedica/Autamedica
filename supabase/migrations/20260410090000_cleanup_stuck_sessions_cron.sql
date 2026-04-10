-- 20260410090000_cleanup_stuck_sessions_cron.sql

-- 1. Create the RPC function that performs the cleanup
CREATE OR REPLACE FUNCTION public.cleanup_stuck_conversation_sessions(threshold_interval text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to update sessions
AS $$
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
    WHERE id IN (SELECT id FROM sessions_to_close)
    RETURNING id INTO updated_count;

    -- Return summary
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    result = jsonb_build_object(
        'count', updated_count,
        'timestamp', now()
    );

    RETURN result;
END;
$$;

-- 2. Schedule the cron job to call the Edge Function every hour
-- Note: Replace 'your-project-ref' if needed, but in migrations we usually use local/relative or placeholders.
-- Many Supabase setups use the net extension to call the Edge Function.

-- Ensure pg_cron and pg_net are enabled (standard in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the cleanup every 30 minutes
-- We call the Edge Function instead of the SQL directly to centralize logs in Supabase Dashboard
SELECT cron.schedule(
    'cleanup-stuck-sessions-every-30m',
    '*/30 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://' || COALESCE(current_setting('app.settings.supabase_project_ref', true), 'localhost') || '.supabase.co/functions/v1/cleanup-stuck-sessions',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'
    );
    $$
);

-- Alternative: If you don't want to rely on pg_net/Edge Function, 
-- you can call the SQL function directly via cron:
/*
SELECT cron.schedule(
    'cleanup-stuck-sessions-sql-only',
    '0 * * * *',
    $$ SELECT public.cleanup_stuck_conversation_sessions('1 hour'); $$
);
*/
