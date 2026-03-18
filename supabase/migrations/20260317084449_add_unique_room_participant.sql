-- Add unique constraint to telemedicine_room_participants to support upsert/tracking
BEGIN;

-- First remove any duplicates if they exist (unlikely in fresh setup but good practice)
DELETE FROM public.telemedicine_room_participants a
USING public.telemedicine_room_participants b
WHERE a.id < b.id
  AND a.room_id = b.room_id
  AND a.user_id = b.user_id;

-- Add the unique constraint
ALTER TABLE public.telemedicine_room_participants
  ADD CONSTRAINT unique_room_participant UNIQUE (room_id, user_id);

COMMIT;
