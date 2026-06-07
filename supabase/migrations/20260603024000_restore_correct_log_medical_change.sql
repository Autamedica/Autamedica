-- Restore correct log_medical_change() to match the actual audit_logs schema.
-- Regression was introduced by the 20260416235904_remote_schema dump which overwrote it with the broken version.

CREATE OR REPLACE FUNCTION public.log_medical_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_patient_user_id uuid;
BEGIN
  SELECT p.user_id
    INTO v_patient_user_id
  FROM public.patients p
  WHERE p.id = COALESCE(NEW.patient_id, OLD.patient_id);

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relname = 'audit_logs'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    INSERT INTO public.audit_logs (
      user_id,
      action,
      resource_type,
      resource_id,
      metadata,
      created_at
    ) VALUES (
      auth.uid(),
      TG_OP,
      'medical_record',
      COALESCE(NEW.id, OLD.id),
      jsonb_build_object(
        'patient_id', COALESCE(NEW.patient_id, OLD.patient_id),
        'patient_user_id', v_patient_user_id,
        'doctor_id', COALESCE(NEW.doctor_id, OLD.doctor_id),
        'type', COALESCE(NEW.type, OLD.type),
        'title', COALESCE(NEW.title, OLD.title),
        'visibility', COALESCE(NEW.visibility, OLD.visibility),
        'date_recorded', COALESCE(NEW.date_recorded, OLD.date_recorded),
        'ip_address', current_setting('request.headers', true)::json->>'x-forwarded-for'
      ),
      now()
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.log_medical_change()
IS 'Audit trigger function for medical_records changes aligned with the current audit_logs schema';
