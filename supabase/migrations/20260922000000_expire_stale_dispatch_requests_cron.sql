-- 20260922000000_expire_stale_dispatch_requests_cron.sql
--
-- Guardrail server-side para pharmacy on-demand dispatch:
-- las solicitudes en estado `searching` caducan en search_timeout_at (25s).
-- Mientras el paciente espera (radar / VIRTUAL_QUEUE), la solicitud debe pasar
-- a `expired` de forma automática; un médico que activa guardia después NUNCA
-- debe recibir solicitudes vencidas como si fueran nuevas.
--
-- Estrategia (mismo patrón que cleanup_stuck_conversation_sessions):
--   1. Función SQL pura que marca `expired` las searching vencidas.
--   2. Job pg_cron que la ejecuta cada minuto (el filtro del Dr. Android por
--      search_timeout_at es el guardrail primario de UI; este job es la
--      limpieza server-side que evita basura acumulada en la cola).

-- 1. Función de expiración
CREATE OR REPLACE FUNCTION public.expire_stale_dispatch_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expired_count integer;
BEGIN
    UPDATE public.pharmacy_dispatch_requests
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'searching'
      AND search_timeout_at <= NOW();

    GET DIAGNOSTICS v_expired_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'expired_count', v_expired_count,
        'executed_at', NOW()
    );
END;
$$;

-- 2. Programar el job (cada minuto; suficiente como housekeeping, la UI filtra por timeout)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('expire-stale-dispatch-requests-minutely')
        WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-dispatch-requests-minutely'
        );

        PERFORM cron.schedule(
            'expire-stale-dispatch-requests-minutely',
            '* * * * *',
            $$ SELECT public.expire_stale_dispatch_requests(); $$
        );
    END IF;
END;
$$;

-- Asegurar el índice parcial para el barrido (evita seqscan en la cola)
CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_requests_searching_timeout
    ON public.pharmacy_dispatch_requests (search_timeout_at)
    WHERE status = 'searching';
