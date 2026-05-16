-- Trigger: Enviar email de bienvenida cuando se crea un perfil nuevo
-- Usa la Edge Function `welcome-email` via pg_net (HTTP desde Postgres)

-- Función trigger que llama a la Edge Function
CREATE OR REPLACE FUNCTION public.notify_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _payload jsonb;
  _supabase_url text;
  _service_key text;
BEGIN
  -- Solo disparar si tiene email
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Construir payload compatible con el formato del Edge Function
  _payload := jsonb_build_object(
    'type', 'INSERT',
    'table', 'profiles',
    'schema', 'public',
    'record', jsonb_build_object(
      'user_id', NEW.user_id,
      'email', NEW.email,
      'role', NEW.role,
      'first_name', NEW.first_name,
      'last_name', NEW.last_name
    )
  );

  -- Obtener URL y key de Supabase desde vault o config
  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  -- Si no hay config, usar la URL hardcodeada (producción)
  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://qxjjrpksmwwrmubhvjew.supabase.co';
  END IF;

  -- Llamar a la Edge Function via pg_net (async, no bloquea el INSERT)
  IF _service_key IS NOT NULL AND _service_key != '' THEN
    PERFORM net.http_post(
      url := _supabase_url || '/functions/v1/welcome-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_key
      ),
      body := _payload
    );
  ELSE
    -- Log si no hay key configurada (no bloquear el registro)
    RAISE WARNING '[welcome-email] No service_role_key configured, skipping email for %', NEW.email;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Nunca bloquear el registro del usuario por un error de email
    RAISE WARNING '[welcome-email] Error sending welcome email to %: %', NEW.email, SQLERRM;
    RETURN NEW;
END;
$$;

-- Comentario descriptivo
COMMENT ON FUNCTION public.notify_welcome_email() IS 
  'Trigger function: envía email de bienvenida automático via Edge Function cuando se crea un perfil nuevo';

-- Crear el trigger (solo en INSERT, una vez por fila)
DROP TRIGGER IF EXISTS trg_welcome_email ON public.profiles;
CREATE TRIGGER trg_welcome_email
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_welcome_email();

-- Comentario en el trigger
COMMENT ON TRIGGER trg_welcome_email ON public.profiles IS
  'Dispara email de bienvenida automático para nuevos registros (pacientes y médicos)';
