BEGIN;

CREATE TABLE IF NOT EXISTS public.portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  audience text NOT NULL DEFAULT 'patient'
    CHECK (audience IN ('patient', 'doctor', 'company', 'admin')),
  category text NOT NULL
    CHECK (category IN ('appointment', 'report', 'community', 'system')),
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  action_label text,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  dedupe_key text NOT NULL,
  context_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_notifications_user_dedupe
  ON public.portal_notifications(user_id, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_user_created
  ON public.portal_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_user_unread
  ON public.portal_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.touch_portal_notifications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_portal_notifications_updated_at ON public.portal_notifications;
CREATE TRIGGER set_portal_notifications_updated_at
  BEFORE UPDATE ON public.portal_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_portal_notifications_updated_at();

ALTER TABLE public.portal_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own portal notifications" ON public.portal_notifications;
CREATE POLICY "Users can view own portal notifications"
  ON public.portal_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own portal notifications" ON public.portal_notifications;
CREATE POLICY "Users can update own portal notifications"
  ON public.portal_notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.portal_notifications IS
  'Centro general de notificaciones del portal, sincronizado desde turnos, informes y comunidad.';

COMMENT ON COLUMN public.portal_notifications.dedupe_key IS
  'Clave estable por evento para evitar duplicados al resincronizar.';

COMMIT;
