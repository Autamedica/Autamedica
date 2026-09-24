-- Migration: 20260922000000_expire_stale_dispatch_requests_cron.sql
--
-- Guardrail server-side para pharmacy on-demand dispatch:
-- las solicitudes en estado `searching` caducan en search_timeout_at (25s).
-- Mientras el paciente espera (radar / VIRTUAL_QUEUE), la solicitud debe pasar
-- a `expired` de forma automática; un médico que activa guardia después NUNCA
-- debe recibir solicitudes vencidas como si fueran nuevas.
--
-- Estrategia (mismo patrón que cleanup_stuck_conversation_sessions):
--   1. Asegurar columna updated_at en pharmacy_dispatch_requests.
--   2. Función SQL pura que marca `expired` las searching vencidas.
--   3. Job pg_cron que la ejecuta cada minuto (idempotente con verificación de pg_cron).

-- 0. Asegurar columna updated_at
ALTER TABLE public.pharmacy_dispatch_requests
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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

GRANT EXECUTE ON FUNCTION public.expire_stale_dispatch_requests() TO service_role;

-- 2. Programar el job (cada minuto; suficiente como housekeeping, la UI filtra por timeout)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.unschedule('expire-stale-dispatch-requests-minutely');
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END;

        PERFORM cron.schedule(
            'expire-stale-dispatch-requests-minutely',
            '* * * * *',
            $cron$ SELECT public.expire_stale_dispatch_requests(); $cron$
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END;
$$;

-- Asegurar el índice parcial para el barrido (evita seqscan en la cola)
CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_requests_searching_timeout
    ON public.pharmacy_dispatch_requests (search_timeout_at)
    WHERE status = 'searching';
