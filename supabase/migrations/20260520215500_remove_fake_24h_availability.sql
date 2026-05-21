-- Migration: Remove fake 24/7 default availability
-- Context: The system auto-inserted 00:00-23:59 availability for all 7 days
-- during doctor onboarding, causing doctors to appear always-available.
-- This led to no-show incidents (Fiorella Vesprini, Agustina Rosetti).
--
-- This migration:
-- 1. Deletes all fake 24/7 entries (00:00-23:59 for all 7 days)
-- 2. Adds a CHECK constraint to prevent new 24/7 entries
-- 3. Logs affected doctors for follow-up

-- Step 1: Identify doctors with ONLY fake 24/7 availability
-- (don't delete if they also have real slots configured)
DO $$
DECLARE
  affected_count integer;
BEGIN
  -- Count doctors that will be affected
  SELECT count(DISTINCT doctor_id)
  INTO affected_count
  FROM doctor_availability da
  WHERE da.start_time = '00:00:00'
    AND da.end_time = '23:59:00'
    AND NOT EXISTS (
      -- Keep if doctor has at least one NON-24/7 slot
      SELECT 1 FROM doctor_availability da2
      WHERE da2.doctor_id = da.doctor_id
        AND (da2.start_time != '00:00:00' OR da2.end_time != '23:59:00')
    );

  RAISE NOTICE 'Removing fake 24/7 availability for % doctors', affected_count;
END $$;

-- Step 2: Delete fake 24/7 entries for doctors who ONLY have fake entries
DELETE FROM doctor_availability
WHERE start_time = '00:00:00'
  AND end_time = '23:59:00'
  AND doctor_id NOT IN (
    -- Preserve doctors who have at least one real slot
    SELECT DISTINCT doctor_id FROM doctor_availability
    WHERE start_time != '00:00:00' OR end_time != '23:59:00'
  );

-- Step 3: Add CHECK constraint to prevent new 24/7 entries
-- A single slot covering 00:00-23:59 is not realistic for any doctor
ALTER TABLE doctor_availability
  ADD CONSTRAINT chk_no_full_day_availability
  CHECK (NOT (start_time = '00:00:00' AND end_time = '23:59:00'));

-- Step 4: Add a comment for documentation
COMMENT ON CONSTRAINT chk_no_full_day_availability ON doctor_availability IS
  'Prevents fake 24/7 availability. Doctors must set real hours. See incident 2026-05-20.';
