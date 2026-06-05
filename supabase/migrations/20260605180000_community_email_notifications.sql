-- Migration: Add community topic and comment email notifications
-- Path: supabase/migrations/20260605180000_community_email_notifications.sql

-- 1. Alter allowed job types constraint to include community_new_topic and community_new_comment
ALTER TABLE growth_os.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_job_type_check;
ALTER TABLE growth_os.email_jobs ADD CONSTRAINT email_jobs_job_type_check
  CHECK (job_type IN (
    'welcome', 'anamnesis_reminder', 'appointment_reminder', 'newsletter',
    'doctor_new_appointment', 'doctor_appointment_cancelled', 'doctor_anamnesis_ready',
    'patient_appointment_cancelled', 'patient_prescription_ready',
    'patient_medical_order_ready', 'nurturing',
    'community_new_topic', 'community_new_comment'
  ));

-- 2. Create the enqueue trigger function for new topics
CREATE OR REPLACE FUNCTION public.enqueue_community_topic_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = growth_os, public
AS $$
DECLARE
  v_member record;
  v_group_name text;
  v_author_name text;
BEGIN
  -- Solo actuar si el post está aprobado y no borrado
  IF NEW.moderation_status <> 'approved' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Si es un update, solo encolar si cambió el estado de moderación a 'approved'
  IF TG_OP = 'UPDATE' AND OLD.moderation_status = 'approved' THEN
    RETURN NEW;
  END IF;

  -- Obtener nombre del grupo
  SELECT name INTO v_group_name 
  FROM public.community_groups 
  WHERE id = NEW.group_id;

  -- Obtener nombre del autor
  IF NEW.is_anonymous THEN
    v_author_name := 'Un miembro de la comunidad';
  ELSE
    SELECT nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '')
    INTO v_author_name
    FROM public.patients p
    JOIN public.profiles pr ON pr.user_id = p.user_id
    WHERE p.id = NEW.author_id
    LIMIT 1;

    IF v_author_name IS NULL OR v_author_name = '' THEN
      v_author_name := COALESCE(NEW.author_display_name, 'Un miembro de la comunidad');
    END IF;
  END IF;

  -- Iterar sobre todos los miembros activos del grupo
  FOR v_member IN (
    SELECT pr.email, pr.first_name, pr.user_id, m.patient_id
    FROM public.group_memberships m
    JOIN public.patients p ON p.id = m.patient_id
    JOIN public.profiles pr ON pr.user_id = p.user_id
    WHERE m.group_id = NEW.group_id
      AND m.status = 'active'
      AND m.patient_id <> COALESCE(NEW.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND pr.email IS NOT NULL
      AND btrim(pr.email) <> ''
  ) LOOP
    INSERT INTO growth_os.email_jobs (
      job_type,
      recipient_email,
      recipient_name,
      user_id,
      patient_id,
      dedupe_key,
      template_data
    ) VALUES (
      'community_new_topic',
      lower(v_member.email),
      v_member.first_name,
      v_member.user_id,
      v_member.patient_id,
      'new_topic:' || NEW.id::text || ':' || v_member.user_id::text,
      jsonb_build_object(
        'topic_title', COALESCE(NEW.title, 'Nuevo tema'),
        'topic_excerpt', substring(NEW.content from 1 for 150),
        'author_name', v_author_name,
        'group_name', COALESCE(v_group_name, 'Comunidad'),
        'action_url', 'https://www.autamedica.com/community/topics/' || NEW.id::text
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3. Register the trigger for community posts
DROP TRIGGER IF EXISTS trg_community_topic_notification ON public.community_posts;
CREATE TRIGGER trg_community_topic_notification
  AFTER INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_community_topic_notifications();

-- 4. Create the enqueue trigger function for new comments
CREATE OR REPLACE FUNCTION public.enqueue_community_comment_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = growth_os, public
AS $$
DECLARE
  v_recipient record;
  v_post record;
  v_group_id uuid;
  v_group_name text;
  v_author_name text;
BEGIN
  -- Solo actuar si el comentario no está borrado
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener info del post y del grupo
  SELECT title, group_id, author_id INTO v_post 
  FROM public.community_posts 
  WHERE id = NEW.post_id;

  IF v_post IS NULL THEN
    RETURN NEW;
  END IF;

  v_group_id := v_post.group_id;

  SELECT name INTO v_group_name 
  FROM public.community_groups 
  WHERE id = v_group_id;

  -- Obtener nombre del autor del comentario
  IF NEW.is_anonymous THEN
    v_author_name := 'Un miembro de la comunidad';
  ELSE
    IF NEW.author_role = 'patient' THEN
      SELECT nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '')
      INTO v_author_name
      FROM public.patients p
      JOIN public.profiles pr ON pr.user_id = p.user_id
      WHERE p.id = NEW.author_id
      LIMIT 1;
    ELSE
      SELECT nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '')
      INTO v_author_name
      FROM public.doctors d
      JOIN public.profiles pr ON pr.user_id = d.user_id
      WHERE d.id = NEW.doctor_author_id
      LIMIT 1;
    END IF;

    IF v_author_name IS NULL OR v_author_name = '' THEN
      v_author_name := COALESCE(NEW.author_display_name, 'Un miembro de la comunidad');
    END IF;
  END IF;

  -- Iterar sobre destinatarios usando UNION
  FOR v_recipient IN (
    -- 1. El autor del post (si es paciente, tiene membresía activa y no es el autor del comentario)
    SELECT p.id AS patient_id, null::uuid AS doctor_id, pr.email, pr.first_name, pr.user_id
    FROM public.community_posts pst
    JOIN public.patients p ON p.id = pst.author_id
    JOIN public.profiles pr ON pr.user_id = p.user_id
    WHERE pst.id = NEW.post_id
      AND pst.author_id <> COALESCE(NEW.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND pr.email IS NOT NULL AND btrim(pr.email) <> ''
      AND EXISTS (
        SELECT 1 FROM public.group_memberships m
        WHERE m.group_id = pst.group_id
          AND m.patient_id = pst.author_id
          AND m.status = 'active'
      )
    UNION
    -- 2. Otros pacientes que comentaron en el post (con membresía activa en el grupo y que no sean el autor del comentario actual)
    SELECT DISTINCT p.id AS patient_id, null::uuid AS doctor_id, pr.email, pr.first_name, pr.user_id
    FROM public.community_post_comments c
    JOIN public.patients p ON p.id = c.author_id
    JOIN public.profiles pr ON pr.user_id = p.user_id
    WHERE c.post_id = NEW.post_id
      AND c.author_role = 'patient'
      AND c.author_id <> COALESCE(NEW.author_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND pr.email IS NOT NULL AND btrim(pr.email) <> ''
      AND EXISTS (
        SELECT 1 FROM public.group_memberships m
        WHERE m.group_id = v_group_id
          AND m.patient_id = c.author_id
          AND m.status = 'active'
      )
    UNION
    -- 3. Doctores que comentaron en el post (que no sean el autor del comentario actual)
    SELECT DISTINCT null::uuid AS patient_id, d.id AS doctor_id, pr.email, pr.first_name, pr.user_id
    FROM public.community_post_comments c
    JOIN public.doctors d ON d.id = c.doctor_author_id
    JOIN public.profiles pr ON pr.user_id = d.user_id
    WHERE c.post_id = NEW.post_id
      AND c.author_role = 'doctor'
      AND c.doctor_author_id <> COALESCE(NEW.doctor_author_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND pr.email IS NOT NULL AND btrim(pr.email) <> ''
  ) LOOP
    INSERT INTO growth_os.email_jobs (
      job_type,
      recipient_email,
      recipient_name,
      user_id,
      patient_id,
      dedupe_key,
      template_data
    ) VALUES (
      'community_new_comment',
      lower(v_recipient.email),
      v_recipient.first_name,
      v_recipient.user_id,
      v_recipient.patient_id,
      'new_comment:' || NEW.id::text || ':' || v_recipient.user_id::text,
      jsonb_build_object(
        'topic_title', COALESCE(v_post.title, 'Nuevo tema'),
        'comment_excerpt', substring(NEW.content from 1 for 150),
        'author_name', v_author_name,
        'group_name', COALESCE(v_group_name, 'Comunidad'),
        'action_url', 'https://www.autamedica.com/community/topics/' || NEW.post_id::text
      )
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 5. Register the trigger for community comments
DROP TRIGGER IF EXISTS trg_community_comment_notification ON public.community_post_comments;
CREATE TRIGGER trg_community_comment_notification
  AFTER INSERT ON public.community_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_community_comment_notifications();
