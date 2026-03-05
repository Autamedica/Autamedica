-- Add FCM push notification columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fcm_token TEXT,
  ADD COLUMN IF NOT EXISTS device_platform TEXT DEFAULT 'android';

-- Index for efficient token lookup when sending push notifications
CREATE INDEX IF NOT EXISTS idx_profiles_fcm_token
  ON public.profiles (fcm_token)
  WHERE fcm_token IS NOT NULL;

COMMENT ON COLUMN public.profiles.fcm_token IS 'Firebase Cloud Messaging device token for push notifications';
COMMENT ON COLUMN public.profiles.device_platform IS 'Device platform: android, ios, web';
