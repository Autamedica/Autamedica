-- Migration: Community notifications triggers
-- Purpose: Notify doctors of new community posts and authors of new comments

-- 1. Trigger function for NEW POSTS (Notify all active doctors)
CREATE OR REPLACE FUNCTION public.notify_doctors_of_new_community_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doctor_record RECORD;
BEGIN
  -- Notify all active doctors
  FOR v_doctor_record IN 
    SELECT p.user_id 
    FROM public.profiles p
    JOIN public.doctors d ON p.user_id = d.user_id
    WHERE d.active = true
  LOOP
    INSERT INTO public.portal_notifications (
      user_id,
      title,
      message,
      type,
      link,
      metadata
    ) VALUES (
      v_doctor_record.user_id,
      'Nueva duda en la comunidad',
      'Un paciente ha publicado: "' || LEFT(NEW.title, 50) || '..."',
      'community_new_post',
      '/doctors/community/post/' || NEW.id,
      jsonb_build_object(
        'post_id', NEW.id,
        'group_id', NEW.group_id,
        'author_name', NEW.author_display_name
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- 2. Trigger function for NEW COMMENTS (Notify post author)
CREATE OR REPLACE FUNCTION public.notify_author_of_new_community_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_author_user_id uuid;
  v_comment_author_name text;
BEGIN
  -- Get post author's user_id
  SELECT p.user_id INTO v_post_author_user_id
  FROM public.community_posts cp
  JOIN public.patients pat ON cp.author_id = pat.id
  JOIN public.profiles p ON pat.user_id = p.user_id
  WHERE cp.id = NEW.post_id;

  -- Don't notify if the author is commenting on their own post
  IF v_post_author_user_id IS NOT NULL AND v_post_author_user_id != auth.uid() THEN
    INSERT INTO public.portal_notifications (
      user_id,
      title,
      message,
      type,
      link,
      metadata
    ) VALUES (
      v_post_author_user_id,
      'Nuevo comentario en tu post',
      COALESCE(NEW.author_display_name, 'Alguien') || ' respondió a tu publicación.',
      'community_new_comment',
      '/patients/community/post/' || NEW.post_id,
      jsonb_build_object(
        'post_id', NEW.post_id,
        'comment_id', NEW.id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Create Triggers
DROP TRIGGER IF EXISTS trg_notify_new_community_post ON public.community_posts;
CREATE TRIGGER trg_notify_new_community_post
  AFTER INSERT ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_doctors_of_new_community_post();

DROP TRIGGER IF EXISTS trg_notify_new_community_comment ON public.community_post_comments;
CREATE TRIGGER trg_notify_new_community_comment
  AFTER INSERT ON public.community_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_author_of_new_community_comment();
