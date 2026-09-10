-- Sync avatars from auth.users (Google OAuth picture/avatar_url) to public.profiles
UPDATE public.profiles p
SET avatar_url = COALESCE(
  p.avatar_url,
  u.raw_user_meta_data->>'avatar_url',
  u.raw_user_meta_data->>'picture'
)
FROM auth.users u
WHERE p.user_id = u.id
  AND (p.avatar_url IS NULL OR p.avatar_url = '')
  AND (u.raw_user_meta_data->>'avatar_url' IS NOT NULL OR u.raw_user_meta_data->>'picture' IS NOT NULL);

-- Create a trigger function to keep profiles.avatar_url updated on user signup or metadata update
CREATE OR REPLACE FUNCTION public.handle_sync_user_avatar()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data IS NOT NULL THEN
    UPDATE public.profiles
    SET avatar_url = COALESCE(
      avatar_url,
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    )
    WHERE user_id = NEW.id
      AND (avatar_url IS NULL OR avatar_url = '');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_avatar_sync ON auth.users;
CREATE TRIGGER on_auth_user_avatar_sync
  AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sync_user_avatar();
