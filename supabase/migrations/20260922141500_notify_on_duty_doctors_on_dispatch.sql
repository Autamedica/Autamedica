-- Migration: 20260922141500_notify_on_duty_doctors_on_dispatch.sql
-- Description: Trigger para despertar y encolar notificación push a médicos de guardia activa cuando entra un paciente

-- 1. Actualizar check constraint de public.notification_queue para soportar PHARMACY_DISPATCH_INCOMING
ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS chk_notification_queue_type;
ALTER TABLE public.notification_queue ADD CONSTRAINT chk_notification_queue_type 
    CHECK (type IN (
        'APPOINTMENT_REMINDER', 
        'PRESCRIPTION_ISSUED', 
        'PRESCRIPTION_EXPIRING', 
        'CERTIFICATE_ISSUED', 
        'CERTIFICATE_READY', 
        'GENERAL',
        'PHARMACY_DISPATCH_INCOMING',
        'pharmacy_dispatch_incoming'
    ));

-- 2. Función del trigger para notificar y despertar a médicos de guardia
CREATE OR REPLACE FUNCTION public.notify_on_duty_doctors_on_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r_doctor RECORD;
    v_body TEXT;
    v_data JSONB;
    v_dedupe_key TEXT;
    v_patient_name TEXT;
BEGIN
    -- Validar que el estado sea 'searching'
    IF NEW.status <> 'searching' THEN
        RETURN NEW;
    END IF;

    v_patient_name := COALESCE(NULLIF(TRIM(NEW.patient_name), ''), 'Paciente');
    v_body := 'Paciente ' || COALESCE(NULLIF(TRIM(NEW.patient_name), ''), 'en espera') || ' solicita atención médica inmediata.';

    v_data := jsonb_build_object(
        'type', 'pharmacy_dispatch_incoming',
        'notification_type', 'pharmacy_dispatch_incoming',
        'request_id', NEW.id::text,
        'room_id', NEW.cloudflare_room_id,
        'patient_name', v_patient_name,
        'patient_dni', COALESCE(NEW.patient_dni, ''),
        'symptom_summary', COALESCE(NEW.symptom_summary, ''),
        'tier', NEW.tier_requested::text,
        'priority', 'high',
        'time_to_live', '30'
    );

    -- Buscar médicos con guardia activa (is_on_duty = true) y con FCM token válido
    FOR r_doctor IN
        SELECT d.user_id, p.fcm_token
        FROM public.doctor_duty_status dds
        JOIN public.doctors d ON d.id = dds.doctor_id
        JOIN public.profiles p ON p.user_id = d.user_id
        WHERE dds.is_on_duty = true
          AND p.fcm_token IS NOT NULL
          AND TRIM(p.fcm_token) <> ''
    LOOP
        v_dedupe_key := 'dispatch_' || NEW.id::text || '_' || r_doctor.user_id::text;

        -- 1. Encolar en notification_queue
        INSERT INTO public.notification_queue (
            user_id,
            type,
            title,
            body,
            deep_link,
            data,
            dedupe_key,
            scheduled_at,
            status
        ) VALUES (
            r_doctor.user_id,
            'PHARMACY_DISPATCH_INCOMING',
            'Nueva Consulta de Guardia On-Demand',
            v_body,
            'autamedica://dispatch/' || NEW.id::text,
            v_data,
            v_dedupe_key,
            NOW(),
            'pending'
        ) ON CONFLICT (dedupe_key) DO NOTHING;

        -- 2. Registrar en portal_notifications para auditoría y visualización en dashboard
        INSERT INTO public.portal_notifications (
            user_id,
            audience,
            category,
            type,
            title,
            body,
            action_url,
            dedupe_key,
            priority,
            context_data
        ) VALUES (
            r_doctor.user_id,
            'doctor',
            'appointment',
            'pharmacy_dispatch_incoming',
            'Nueva Consulta de Guardia On-Demand',
            v_body,
            '/doctors/dispatch/' || NEW.id::text,
            'portal_' || v_dedupe_key,
            'urgent',
            v_data
        ) ON CONFLICT (user_id, dedupe_key) DO NOTHING;

        -- 3. Invocar inmediatamente send-push-notification vía pg_net para despertar el teléfono del médico
        PERFORM net.http_post(
            url := 'https://qxjjrpksmwwrmubhvjew.supabase.co/functions/v1/send-push-notification',
            body := jsonb_build_object(
                'userId', r_doctor.user_id,
                'title', 'Nueva Consulta de Guardia On-Demand',
                'body', v_body,
                'data', v_data
            ),
            headers := jsonb_build_object(
                'Content-Type', 'application/json'
            )
        );

    END LOOP;

    RETURN NEW;
END;
$$;

-- 3. Crear el trigger AFTER INSERT
DROP TRIGGER IF EXISTS trg_notify_on_duty_doctors_on_dispatch ON public.pharmacy_dispatch_requests;
CREATE TRIGGER trg_notify_on_duty_doctors_on_dispatch
    AFTER INSERT ON public.pharmacy_dispatch_requests
    FOR EACH ROW
    WHEN (NEW.status = 'searching')
    EXECUTE FUNCTION public.notify_on_duty_doctors_on_dispatch();

-- 4. Permisos
GRANT EXECUTE ON FUNCTION public.notify_on_duty_doctors_on_dispatch() TO authenticated, service_role;
