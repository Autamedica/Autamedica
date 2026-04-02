-- Fix: appointments that had a linked call that ended but never reached 'completed'
-- because the call skipped the 'connected' state or the sync trigger missed.
--
-- 1. One-time backfill: mark past appointments as completed if they had an ended call
-- 2. Improve sync_call_to_appointment to handle edge cases

-- ============================================================
-- 1. Backfill stuck appointments
-- ============================================================

-- The project drifted from migration history and some environments never
-- materialized the calls.appointment_id column. Re-create the expected link
-- here before running the backfill logic.
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS appointment_id uuid
  REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_appointment_id
  ON public.calls (appointment_id);

-- Recover appointment links for rooms that already have a telemedicine session.
UPDATE public.calls AS c
SET appointment_id = ts.appointment_id
FROM public.telemedicine_sessions AS ts
WHERE c.appointment_id IS NULL
  AND ts.appointment_id IS NOT NULL
  AND ts.room_id = c.room_id;

UPDATE public.appointments AS a
SET status = 'completed', updated_at = now()
WHERE a.status IN ('scheduled', 'confirmed', 'in_progress')
  AND a.end_time < now()
  AND EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.appointment_id = a.id
      AND c.status = 'ended'
  );

-- ============================================================
-- 2. Fix sync_call_to_appointment: also complete if appointment
--    is still scheduled/confirmed (call went ended without connected)
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_call_to_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  -- Accept in_progress, scheduled, or confirmed as valid prior states
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' THEN
    UPDATE public.appointments
    SET status = 'completed', updated_at = now()
    WHERE id = NEW.appointment_id
      AND status IN ('in_progress', 'scheduled', 'confirmed');
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Recalculate all rankings after backfill
-- ============================================================

SELECT public.recalculate_all_rankings();
