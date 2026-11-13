-- Nonmutating migration assertion; use after migration replay.
DO $verify$
BEGIN
  IF to_regclass('public.idx_doctors_active_duty_tiers') IS NOT NULL
    OR to_regclass('public.idx_portal_notifications_user_dedupe') IS NOT NULL
  THEN RAISE EXCEPTION 'Duplicate index was not removed'; END IF;

  IF to_regclass('public.idx_doctors_on_duty_pharmacy') IS NULL
    OR to_regclass('public.uq_portal_notifications_user_dedupe') IS NULL
  THEN RAISE EXCEPTION 'A retained index is missing'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conindid='public.uq_portal_notifications_user_dedupe'::regclass
      AND contype='u'
  ) THEN RAISE EXCEPTION 'Notification uniqueness constraint missing'; END IF;
END;
$verify$;
