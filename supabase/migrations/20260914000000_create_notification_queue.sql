CREATE TABLE IF NOT EXISTS public.notification_queue (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type text NOT NULL DEFAULT 'GENERAL',
    title text NOT NULL,
    body text NOT NULL,
    deep_link text,
    data jsonb DEFAULT '{}'::jsonb,
    dedupe_key text,
    scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT chk_notification_queue_status CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
    CONSTRAINT chk_notification_queue_type CHECK (type IN ('APPOINTMENT_REMINDER', 'PRESCRIPTION_ISSUED', 'PRESCRIPTION_EXPIRING', 'CERTIFICATE_ISSUED', 'CERTIFICATE_READY', 'GENERAL'))
);

CREATE INDEX idx_notification_queue_drain
    ON public.notification_queue (status, scheduled_at)
    WHERE status IN ('pending', 'processing');

CREATE UNIQUE INDEX idx_notification_queue_dedupe
    ON public.notification_queue (dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX idx_notification_queue_user_id
    ON public.notification_queue (user_id);

ALTER TABLE public.notification_queue OWNER TO postgres;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enqueue_notification(
    p_user_id uuid,
    p_type text,
    p_title text,
    p_body text,
    p_deep_link text DEFAULT NULL,
    p_data jsonb DEFAULT '{}'::jsonb,
    p_dedupe_key text DEFAULT NULL,
    p_scheduled_at timestamp with time zone DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO public.notification_queue (
        user_id, type, title, body, deep_link, data, dedupe_key, scheduled_at
    ) VALUES (
        p_user_id, p_type, p_title, p_body, p_deep_link, p_data, p_dedupe_key, p_scheduled_at
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.drain_notification_queue(
    p_batch_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_items jsonb;
BEGIN
    -- Atomically claim due items and move them to 'processing';
    -- the caller (edge function) marks the final sent/failed outcome.
    -- 'processing' items stuck for more than 5 minutes are reclaimed.
    WITH drained AS (
        SELECT id
        FROM public.notification_queue
        WHERE (
            (status = 'pending' AND scheduled_at <= now())
            OR (status = 'processing' AND updated_at <= now() - interval '5 minutes')
        )
        ORDER BY scheduled_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.notification_queue q
        SET status = 'processing', attempts = attempts + 1, last_error = NULL, updated_at = now()
        FROM drained d
        WHERE q.id = d.id
        RETURNING q.id, q.user_id, q.type, q.title, q.body, q.deep_link, q.data
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'user_id', c.user_id,
            'type', c.type,
            'title', c.title,
            'body', c.body,
            'deep_link', c.deep_link,
            'data', c.data
        )
    ), '[]'::jsonb)
    INTO v_items
    FROM claimed c;

    RETURN v_items;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_patient_user_id uuid;
    v_reminder_at timestamp with time zone;
    v_dedupe_key text;
BEGIN
    IF NEW.status NOT IN ('confirmed', 'scheduled') THEN
        RETURN NEW;
    END IF;

    IF NEW.start_time IS NULL OR NEW.start_time <= now() THEN
        RETURN NEW;
    END IF;

    SELECT p.user_id INTO v_patient_user_id
    FROM public.patients p
    WHERE p.id = NEW.patient_id;

    IF v_patient_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_reminder_at := GREATEST(NEW.start_time - interval '2 hours', now());

    v_dedupe_key := 'appointment_reminder:' || NEW.id::text;

    PERFORM public.enqueue_notification(
        p_user_id := v_patient_user_id,
        p_type := 'APPOINTMENT_REMINDER',
        p_title := 'Recordatorio de turno',
        p_body := 'Tu turno es en ' || extract(epoch from (NEW.start_time - now()))::int / 60 || ' minutos. ¡No lo olvides!',
        p_deep_link := 'autamedica://appointments/' || NEW.id::text,
        p_data := jsonb_build_object('appointment_id', NEW.id::text),
        p_dedupe_key := v_dedupe_key,
        p_scheduled_at := v_reminder_at
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_certificate_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_patient_user_id uuid;
    v_dedupe_key text;
BEGIN
    IF TG_OP != 'INSERT' THEN
        RETURN NEW;
    END IF;

    IF NEW.patient_id IS NULL OR NEW.status = 'cancelled' THEN
        RETURN NEW;
    END IF;

    SELECT p.user_id INTO v_patient_user_id
    FROM public.patients p
    WHERE p.id = NEW.patient_id;

    IF v_patient_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_dedupe_key := 'certificate_issued:' || NEW.id::text;

    PERFORM public.enqueue_notification(
        p_user_id := v_patient_user_id,
        p_type := 'CERTIFICATE_ISSUED',
        p_title := 'Atestado disponible',
        p_body := 'Tu atestado médico ya está listo. Podés descargarlo desde la app.',
        p_deep_link := 'autamedica://certificates',
        p_data := jsonb_build_object(
            'certificate_id', NEW.id::text,
            'certificate_type', NEW.certificate_type::text
        ),
        p_dedupe_key := v_dedupe_key,
        p_scheduled_at := now()
    );

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_prescription_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_patient_user_id uuid;
    v_dedupe_key text;
BEGIN
    IF TG_OP != 'INSERT' THEN
        RETURN NEW;
    END IF;

    IF NEW.patient_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT p.user_id INTO v_patient_user_id
    FROM public.patients p
    WHERE p.id = NEW.patient_id;

    IF v_patient_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_dedupe_key := 'prescription_issued:' || NEW.id::text;

    PERFORM public.enqueue_notification(
        p_user_id := v_patient_user_id,
        p_type := 'PRESCRIPTION_ISSUED',
        p_title := 'Receta emitida',
        p_body := 'Tu receta ya está disponible. Podés verla y descargarla desde la app.',
        p_deep_link := 'autamedica://prescriptions',
        p_data := jsonb_build_object('prescription_id', NEW.id::text),
        p_dedupe_key := v_dedupe_key,
        p_scheduled_at := now()
    );

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'appointments') THEN
        DROP TRIGGER IF EXISTS trg_enqueue_appointment_reminder ON public.appointments;
        CREATE TRIGGER trg_enqueue_appointment_reminder
            AFTER INSERT OR UPDATE ON public.appointments
            FOR EACH ROW
            EXECUTE FUNCTION public.enqueue_appointment_reminder();
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'medical_certificates') THEN
        DROP TRIGGER IF EXISTS trg_enqueue_certificate_notification ON public.medical_certificates;
        CREATE TRIGGER trg_enqueue_certificate_notification
            AFTER INSERT ON public.medical_certificates
            FOR EACH ROW
            EXECUTE FUNCTION public.enqueue_certificate_notification();
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'prescriptions') THEN
        DROP TRIGGER IF EXISTS trg_enqueue_prescription_notification ON public.prescriptions;
        CREATE TRIGGER trg_enqueue_prescription_notification
            AFTER INSERT ON public.prescriptions
            FOR EACH ROW
            EXECUTE FUNCTION public.enqueue_prescription_notification();
    END IF;
END $$;

-- NOTE: The notification queue is drained by the reminder-worker daemon
-- (apps/reminder-worker) which runs every 60s and has SUPABASE_SERVICE_ROLE_KEY.
-- pg_cron was intentionally NOT used because app.settings.service_role_key
-- is not configured in this project (the existing cleanup-stuck-sessions cron
-- has the same issue and silently fails auth on every invocation).
-- Manual dispatch for testing: call public.drain_notification_queue() via SQL
-- and then send-push-notification via the REST API.