-- Freeze the hour-based leave duration while a trusted signing request is active.
CREATE OR REPLACE FUNCTION public.firmar_block_mutation_while_signing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (
    NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
    NEW.doctor_id IS DISTINCT FROM OLD.doctor_id OR
    NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR
    NEW.certificate_type IS DISTINCT FROM OLD.certificate_type OR
    NEW.days_of_rest IS DISTINCT FROM OLD.days_of_rest OR
    NEW.rest_hours IS DISTINCT FROM OLD.rest_hours OR
    NEW.start_date IS DISTINCT FROM OLD.start_date OR
    NEW.end_date IS DISTINCT FROM OLD.end_date OR
    NEW.diagnosis IS DISTINCT FROM OLD.diagnosis OR
    NEW.hide_diagnosis IS DISTINCT FROM OLD.hide_diagnosis OR
    NEW.observations IS DISTINCT FROM OLD.observations OR
    NEW.treatment IS DISTINCT FROM OLD.treatment OR
    NEW.country_code IS DISTINCT FROM OLD.country_code OR
    NEW.cuir IS DISTINCT FROM OLD.cuir
  ) AND EXISTS (
    SELECT 1 FROM public.medical_certificate_signature_requests r
    WHERE r.certificate_id = OLD.id
      AND r.expires_at > now()
      AND r.status IN ('pending','awaiting_doctor_authorization','processing')
  ) THEN
    RAISE EXCEPTION 'firmar_clinical_document_frozen';
  END IF;
  RETURN NEW;
END;
$$;
