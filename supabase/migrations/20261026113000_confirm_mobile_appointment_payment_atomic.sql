-- Confirm a signed, provider-verified mobile appointment payment atomically.
-- Only the service role (our verified webhook) may invoke this function.
-- Transactional row locks prevent two webhooks from approving different payments
-- or leaving the money marked approved without confirming the appointment.
CREATE OR REPLACE FUNCTION public.confirm_mobile_appointment_payment(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_provider_payment_id text,
  p_paid_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  appointment_payment_id uuid,
  already_approved boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_appointment public.appointments;
  v_payment public.appointment_payments;
  v_already boolean;
BEGIN
  IF p_appointment_id IS NULL OR p_patient_id IS NULL OR p_doctor_id IS NULL
    OR p_amount_cents IS NULL OR p_amount_cents <= 0
    OR p_currency NOT IN ('ARS', 'BRL')
    OR p_provider_payment_id IS NULL OR p_provider_payment_id !~ '^[0-9]{1,32}$'
  THEN
    RAISE EXCEPTION 'mobile_payment_invalid_arguments';
  END IF;

  SELECT a.* INTO v_appointment
    FROM public.appointments a
   WHERE a.id = p_appointment_id
   FOR UPDATE;

  IF NOT FOUND OR v_appointment.patient_id IS DISTINCT FROM p_patient_id
     OR v_appointment.doctor_id IS DISTINCT FROM p_doctor_id THEN
    RAISE EXCEPTION 'mobile_payment_appointment_mismatch';
  END IF;

  IF v_appointment.status NOT IN ('payment_pending', 'pending_payment', 'scheduled', 'confirmed') THEN
    RAISE EXCEPTION 'mobile_payment_appointment_not_confirmable';
  END IF;

  SELECT ap.* INTO v_payment
    FROM public.appointment_payments ap
   WHERE ap.appointment_id = p_appointment_id
   FOR UPDATE;

  IF NOT FOUND OR v_payment.patient_id <> p_patient_id OR v_payment.doctor_id <> p_doctor_id
    OR v_payment.gross_amount <> p_amount_cents OR v_payment.currency <> p_currency
    OR v_payment.provider <> 'mercadopago'
  THEN
    RAISE EXCEPTION 'mobile_payment_record_mismatch';
  END IF;

  IF v_payment.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'mobile_payment_status_not_confirmable';
  END IF;

  IF v_payment.provider_payment_id IS NOT NULL
     AND v_payment.provider_payment_id IS DISTINCT FROM p_provider_payment_id THEN
    RAISE EXCEPTION 'mobile_payment_id_conflict';
  END IF;

  v_already := v_payment.status = 'approved';

  IF NOT v_already THEN
    UPDATE public.appointment_payments ap
       SET status = 'approved',
           provider_payment_id = p_provider_payment_id,
           paid_at = COALESCE(p_paid_at, now()),
           updated_at = now()
     WHERE ap.id = v_payment.id;
  END IF;

  IF v_appointment.status <> 'confirmed' THEN
    UPDATE public.appointments a
       SET status = 'confirmed', updated_at = now()
     WHERE a.id = p_appointment_id;
  END IF;

  appointment_payment_id := v_payment.id;
  already_approved := v_already;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_mobile_appointment_payment(
  uuid, uuid, uuid, integer, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_mobile_appointment_payment(
  uuid, uuid, uuid, integer, text, text, timestamptz
) TO service_role;
