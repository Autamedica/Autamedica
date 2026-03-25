-- Seed doctor_availability with realistic schedules for active doctors.
-- This data is required for the scheduling system to generate available slots.
-- Without it, getOpenSlots() returns [] and patients cannot book appointments.

-- Doctor 1 (286ed7e8): Lun-Vie mañana y tarde, slots de 30 min
INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration, is_active, location)
SELECT d.id, dow.day, dow.start_t::time, dow.end_t::time, 30, true, 'Consultorio A'
FROM doctors d
CROSS JOIN (VALUES
  (1, '08:00', '12:00'), (1, '14:00', '18:00'),
  (2, '08:00', '12:00'), (2, '14:00', '18:00'),
  (3, '08:00', '12:00'), (3, '14:00', '18:00'),
  (4, '08:00', '12:00'), (4, '14:00', '18:00'),
  (5, '08:00', '12:00')
) AS dow(day, start_t, end_t)
WHERE d.id = '286ed7e8-b288-4d0d-b429-d7505a1f0c25'
  AND NOT EXISTS (
    SELECT 1 FROM doctor_availability da
    WHERE da.doctor_id = d.id AND da.day_of_week = dow.day AND da.start_time = dow.start_t::time
  );

-- Doctor 2 (b9129efe): Lun-Mie-Vie mañana, slots de 20 min
INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration, is_active, location)
SELECT d.id, dow.day, dow.start_t::time, dow.end_t::time, 20, true, 'Consultorio B'
FROM doctors d
CROSS JOIN (VALUES
  (1, '09:00', '13:00'),
  (3, '09:00', '13:00'),
  (5, '09:00', '13:00')
) AS dow(day, start_t, end_t)
WHERE d.id = 'b9129efe-8a9f-4dd5-8b8b-b436ff5f0eb1'
  AND NOT EXISTS (
    SELECT 1 FROM doctor_availability da
    WHERE da.doctor_id = d.id AND da.day_of_week = dow.day AND da.start_time = dow.start_t::time
  );

-- Doctor 3 (d59069f2): Mar-Jue, slots de 45 min (telemedicina)
INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_duration, is_active, location)
SELECT d.id, dow.day, dow.start_t::time, dow.end_t::time, 45, true, 'Telemedicina'
FROM doctors d
CROSS JOIN (VALUES
  (2, '10:00', '16:00'),
  (4, '10:00', '16:00')
) AS dow(day, start_t, end_t)
WHERE d.id = 'd59069f2-03ad-4fcc-a223-d98190be0e58'
  AND NOT EXISTS (
    SELECT 1 FROM doctor_availability da
    WHERE da.doctor_id = d.id AND da.day_of_week = dow.day AND da.start_time = dow.start_t::time
  );
