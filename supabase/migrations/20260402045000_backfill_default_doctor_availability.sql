-- Backfill default availability for active doctors that still have no schedule rows.
-- This keeps patient booking consistent with the requirement that every active doctor
-- must expose at least a baseline weekly agenda in doctor_availability.

INSERT INTO public.doctor_availability (
  doctor_id,
  day_of_week,
  start_time,
  end_time,
  slot_duration,
  is_active,
  location
)
SELECT
  d.id,
  preset.day_of_week,
  preset.start_time::time,
  preset.end_time::time,
  30,
  true,
  null
FROM public.doctors d
CROSS JOIN (
  VALUES
    (1, '09:00', '17:00'),
    (2, '09:00', '17:00'),
    (3, '09:00', '17:00'),
    (4, '09:00', '17:00'),
    (5, '09:00', '17:00')
) AS preset(day_of_week, start_time, end_time)
WHERE d.active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.doctor_availability existing
    WHERE existing.doctor_id = d.id
      AND existing.is_active = true
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.doctor_availability duplicate_guard
    WHERE duplicate_guard.doctor_id = d.id
      AND duplicate_guard.day_of_week = preset.day_of_week
      AND duplicate_guard.start_time = preset.start_time::time
  );
