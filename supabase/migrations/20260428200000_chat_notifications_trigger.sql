-- 20260428200000_chat_notifications_trigger.sql

-- 1. Añadir 'chat' a las categorías de notificación si no existe
ALTER TABLE public.portal_notifications DROP CONSTRAINT IF EXISTS portal_notifications_category_check;
ALTER TABLE public.portal_notifications ADD CONSTRAINT portal_notifications_category_check 
    CHECK (category IN ('appointment', 'report', 'community', 'system', 'chat'));

-- 2. Función para manejar notificaciones de chat
CREATE OR REPLACE FUNCTION public.handle_chat_notification()
RETURNS trigger AS $$
DECLARE
    target_user_id uuid;
    target_audience text;
    sender_name text;
    chat_session record;
BEGIN
    -- Obtener información de la sesión
    SELECT * INTO chat_session FROM public.conversation_sessions WHERE id = NEW.session_id;
    
    -- Determinar destinatario
    IF NEW.role = 'patient' THEN
        -- El paciente escribió, notificar al médico
        SELECT user_id INTO target_user_id FROM public.doctors WHERE id = chat_session.doctor_id;
        target_audience := 'doctor';
        
        -- Obtener nombre del paciente para el título
        SELECT concat_ws(' ', p.first_name, p.last_name) INTO sender_name
        FROM public.profiles p 
        JOIN public.patients pat ON pat.user_id = p.user_id
        WHERE pat.id = NEW.patient_id;
    ELSIF NEW.role = 'doctor' THEN
        -- El médico escribió, notificar al paciente
        SELECT user_id INTO target_user_id FROM public.patients WHERE id = chat_session.patient_id;
        target_audience := 'patient';
        
        -- Obtener nombre del médico
        SELECT concat_ws(' ', p.first_name, p.last_name) INTO sender_name
        FROM public.profiles p
        JOIN public.doctors d ON d.user_id = p.user_id
        WHERE d.id = chat_session.doctor_id;
        
        IF sender_name IS NULL THEN sender_name := 'Tu médico'; END IF;
    ELSE
        RETURN NEW; -- No notificar para assistant/system por ahora
    END IF;

    -- Insertar la notificación
    IF target_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.portal_notifications (
        user_id,
        audience,
        category,
        type,
        title,
        body,
        action_url,
        dedupe_key,
        priority
    ) VALUES (
        target_user_id,
        target_audience,
        'chat',
        'new_message',
        'Nuevo mensaje de ' || COALESCE(sender_name, 'Chat'),
        LEFT(NEW.raw_text, 100), -- Mostrar adelanto del mensaje
        CASE 
            WHEN target_audience = 'doctor' THEN '/doctors/consultations?patient=' || chat_session.patient_id
            ELSE '/patients/dashboard' -- O la ruta del chat de paciente
        END,
        'chat_msg_' || NEW.id,
        'normal'
    ) ON CONFLICT (user_id, dedupe_key) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear el trigger
DROP TRIGGER IF EXISTS on_chat_message_notification ON public.conversation_events;
CREATE TRIGGER on_chat_message_notification
    AFTER INSERT ON public.conversation_events
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_chat_notification();
