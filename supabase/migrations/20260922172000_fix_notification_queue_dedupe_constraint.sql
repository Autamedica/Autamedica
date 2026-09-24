-- Fix ON CONFLICT deduplication constraint for notification_queue and portal_notifications
-- Ensures notify_on_duty_doctors_on_dispatch trigger executes without "no unique or exclusion constraint matching ON CONFLICT"

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_notification_queue_dedupe'
    ) THEN
        ALTER TABLE public.notification_queue 
        ADD CONSTRAINT uq_notification_queue_dedupe UNIQUE (dedupe_key);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_portal_notifications_user_dedupe'
    ) THEN
        ALTER TABLE public.portal_notifications 
        ADD CONSTRAINT uq_portal_notifications_user_dedupe UNIQUE (user_id, dedupe_key);
    END IF;
END $$;
