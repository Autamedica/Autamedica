-- Send one transactional welcome email with role-specific content.
-- Welcome emails are account messages and do not depend on newsletter consent.

DROP TRIGGER IF EXISTS trg_welcome_email ON public.profiles;
DROP FUNCTION IF EXISTS public.notify_welcome_email();

CREATE OR REPLACE FUNCTION growth_os.enqueue_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = growth_os, public
AS $$
DECLARE
  v_name text;
  v_role text;
  v_user_key text;
  v_action_url text;
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
    RETURN NEW;
  END IF;

  v_name := nullif(btrim(coalesce(NEW.first_name, '')), '');
  v_role := CASE WHEN NEW.role = 'doctor' THEN 'doctor' ELSE 'patient' END;
  v_user_key := coalesce(NEW.user_id::text, lower(NEW.email));
  v_action_url := CASE
    WHEN v_role = 'doctor' THEN 'https://doctor.autamedica.com/doctors/perfil?utm_source=email&utm_medium=welcome&utm_campaign=doctor_welcome'
    ELSE 'https://patients.autamedica.com/patients/anamnesis?utm_source=email&utm_medium=welcome&utm_campaign=patient_welcome'
  END;

  INSERT INTO growth_os.email_jobs (
    job_type,
    recipient_email,
    recipient_name,
    user_id,
    dedupe_key,
    template_data
  )
  VALUES (
    'welcome',
    lower(NEW.email),
    v_name,
    NEW.user_id,
    'welcome:' || v_user_key,
    jsonb_build_object(
      'recipient_role', v_role,
      'action_url', v_action_url
    )
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_welcome_email ON public.profiles;
CREATE TRIGGER trg_enqueue_welcome_email
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION growth_os.enqueue_welcome_email();

COMMENT ON FUNCTION growth_os.enqueue_welcome_email() IS
  'Enqueues one transactional, role-aware welcome email for patient and doctor registrations.';
