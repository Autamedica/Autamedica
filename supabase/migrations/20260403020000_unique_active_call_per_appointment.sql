-- Prevent multiple active calls for the same appointment at the DB level.
-- Only one non-terminal call (not declined/canceled/ended) per appointment.
-- This closes a race condition where concurrent startCall requests could create duplicates.

CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_one_active_per_appointment
ON public.calls (appointment_id)
WHERE appointment_id IS NOT NULL
  AND status NOT IN ('declined', 'canceled', 'ended');
