CREATE TABLE IF NOT EXISTS public.patient_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_notification_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.patient_notification_preferences TO authenticated;

DROP POLICY IF EXISTS patient_notification_preferences_select_own ON public.patient_notification_preferences;
CREATE POLICY patient_notification_preferences_select_own
  ON public.patient_notification_preferences FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS patient_notification_preferences_insert_own ON public.patient_notification_preferences;
CREATE POLICY patient_notification_preferences_insert_own
  ON public.patient_notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS patient_notification_preferences_update_own ON public.patient_notification_preferences;
CREATE POLICY patient_notification_preferences_update_own
  ON public.patient_notification_preferences FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
