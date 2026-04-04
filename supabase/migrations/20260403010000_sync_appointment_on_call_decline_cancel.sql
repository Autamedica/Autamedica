-- Sync appointment status when a call is declined or canceled.
-- Only cancels the appointment if no other active calls remain for it.
-- Extends the existing sync_call_to_appointment() trigger.

CREATE OR REPLACE FUNCTION public.sync_call_to_appointment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Call connected → appointment in_progress
  IF NEW.status = 'connected' AND OLD.status IS DISTINCT FROM 'connected' THEN
    UPDATE public.appointments
    SET status = 'in_progress', updated_at = now()
    WHERE id = NEW.appointment_id
      AND status IN ('scheduled', 'confirmed');
  END IF;

  -- Call ended → appointment completed
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' THEN
    UPDATE public.appointments
    SET status = 'completed', updated_at = now()
    WHERE id = NEW.appointment_id
      AND status IN ('in_progress', 'scheduled', 'confirmed');
  END IF;

  -- Call declined/canceled → appointment cancelled
  -- Only if no other non-terminal calls exist for this appointment.
  -- This prevents premature cancellation when the doctor might retry.
  IF NEW.status IN ('declined', 'canceled') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.appointments a
    SET status = 'cancelled', updated_at = now()
    WHERE a.id = NEW.appointment_id
      AND a.status IN ('scheduled', 'confirmed')
      AND NOT EXISTS (
        SELECT 1 FROM public.calls c
        WHERE c.appointment_id = a.id
          AND c.id != NEW.id
          AND c.status NOT IN ('declined', 'canceled', 'ended')
      );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
