-- ============================================================
-- Migration: Extend patient community interactions
-- Date: 2026-03-27
-- Purpose: Add comments, post management and gender-restricted groups
-- ============================================================

ALTER TABLE public.community_groups
  ADD COLUMN IF NOT EXISTS required_gender text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_groups_required_gender_check'
  ) THEN
    ALTER TABLE public.community_groups
      ADD CONSTRAINT community_groups_required_gender_check
      CHECK (required_gender IS NULL OR required_gender IN ('male', 'female'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.community_post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  author_display_name text,
  is_anonymous boolean NOT NULL DEFAULT false,
  content text NOT NULL CHECK (char_length(trim(content)) >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_community_groups_required_gender
  ON public.community_groups(required_gender);
CREATE INDEX IF NOT EXISTS idx_community_post_comments_post_created
  ON public.community_post_comments(post_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_community_post_comments_author_id
  ON public.community_post_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_community_post_comments_deleted_at
  ON public.community_post_comments(deleted_at);

CREATE OR REPLACE FUNCTION public.community_group_allowed_for_patient(
  target_patient_id uuid,
  target_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT groups.required_gender IS NULL OR patients.gender = groups.required_gender
      FROM public.community_groups AS groups
      JOIN public.patients AS patients
        ON patients.id = target_patient_id
      WHERE groups.id = target_group_id
        AND groups.deleted_at IS NULL
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.current_patient_can_access_community_group(
  target_group_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_groups AS groups
    JOIN public.patients AS patients
      ON patients.user_id = auth.uid()
    WHERE groups.id = target_group_id
      AND groups.deleted_at IS NULL
      AND patients.active = true
      AND (groups.required_gender IS NULL OR patients.gender = groups.required_gender)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_patient_owns_community_post(
  target_post_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_posts AS posts
    JOIN public.patients AS patients
      ON patients.id = posts.author_id
    WHERE posts.id = target_post_id
      AND patients.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_community_post_comments(target_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_posts AS posts
  SET
    comment_count = (
      SELECT count(*)
      FROM public.community_post_comments AS comments
      WHERE comments.post_id = target_post_id
        AND comments.deleted_at IS NULL
    ),
    updated_at = now()
  WHERE posts.id = target_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_community_post_comment_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_community_post_comments(COALESCE(NEW.post_id, OLD.post_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_community_post_comments_updated_at ON public.community_post_comments;
CREATE TRIGGER trg_touch_community_post_comments_updated_at
  BEFORE UPDATE ON public.community_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_community_updated_at();

DROP TRIGGER IF EXISTS trg_community_post_comment_counts ON public.community_post_comments;
CREATE TRIGGER trg_community_post_comment_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.community_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_community_post_comment_counts();

ALTER TABLE public.community_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_groups_select_all ON public.community_groups;
DROP POLICY IF EXISTS community_groups_select_visible ON public.community_groups;
CREATE POLICY community_groups_select_visible ON public.community_groups
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      required_gender IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.patients AS patients
        WHERE patients.user_id = auth.uid()
          AND patients.active = true
          AND patients.gender = community_groups.required_gender
      )
    )
  );

DROP POLICY IF EXISTS group_memberships_select_own ON public.group_memberships;
CREATE POLICY group_memberships_select_own ON public.group_memberships
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = group_memberships.patient_id
        AND patients.user_id = auth.uid()
    )
    AND public.community_group_allowed_for_patient(group_memberships.patient_id, group_memberships.group_id)
  );

DROP POLICY IF EXISTS group_memberships_insert_own ON public.group_memberships;
CREATE POLICY group_memberships_insert_own ON public.group_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = group_memberships.patient_id
        AND patients.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.community_groups AS groups
      WHERE groups.id = group_memberships.group_id
        AND groups.deleted_at IS NULL
    )
    AND public.community_group_allowed_for_patient(group_memberships.patient_id, group_memberships.group_id)
    AND group_memberships.status = 'active'
    AND group_memberships.role = 'member'
    AND group_memberships.post_count = 0
    AND group_memberships.comment_count = 0
    AND group_memberships.helpful_reactions_received = 0
  );

DROP POLICY IF EXISTS community_posts_select_approved ON public.community_posts;
CREATE POLICY community_posts_select_approved ON public.community_posts
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND moderation_status = 'approved'
    AND public.current_patient_can_access_community_group(group_id)
  );

DROP POLICY IF EXISTS community_posts_insert_own ON public.community_posts;
CREATE POLICY community_posts_insert_own ON public.community_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = community_posts.author_id
        AND patients.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.group_memberships AS memberships
      WHERE memberships.group_id = community_posts.group_id
        AND memberships.patient_id = community_posts.author_id
        AND memberships.status = 'active'
    )
    AND public.community_group_allowed_for_patient(community_posts.author_id, community_posts.group_id)
    AND community_posts.deleted_at IS NULL
    AND community_posts.moderation_status = 'approved'
    AND community_posts.reaction_count = 0
    AND community_posts.comment_count = 0
    AND community_posts.view_count = 0
  );

DROP POLICY IF EXISTS community_posts_update_own ON public.community_posts;
CREATE POLICY community_posts_update_own ON public.community_posts
  FOR UPDATE TO authenticated
  USING (public.current_patient_owns_community_post(id))
  WITH CHECK (
    public.current_patient_owns_community_post(id)
    AND public.current_patient_can_access_community_group(group_id)
  );

DROP POLICY IF EXISTS post_reactions_select_all ON public.post_reactions;
CREATE POLICY post_reactions_select_all ON public.post_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_posts AS posts
      WHERE posts.id = post_reactions.post_id
        AND posts.deleted_at IS NULL
        AND posts.moderation_status = 'approved'
        AND public.current_patient_can_access_community_group(posts.group_id)
    )
  );

DROP POLICY IF EXISTS post_reactions_insert_own ON public.post_reactions;
CREATE POLICY post_reactions_insert_own ON public.post_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = post_reactions.patient_id
        AND patients.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.community_posts AS posts
      WHERE posts.id = post_reactions.post_id
        AND posts.deleted_at IS NULL
        AND posts.moderation_status = 'approved'
        AND public.community_group_allowed_for_patient(post_reactions.patient_id, posts.group_id)
    )
  );

DROP POLICY IF EXISTS post_reactions_update_own ON public.post_reactions;
CREATE POLICY post_reactions_update_own ON public.post_reactions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = post_reactions.patient_id
        AND patients.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = post_reactions.patient_id
        AND patients.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS community_post_comments_select_allowed ON public.community_post_comments;
CREATE POLICY community_post_comments_select_allowed ON public.community_post_comments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.community_posts AS posts
      WHERE posts.id = community_post_comments.post_id
        AND posts.deleted_at IS NULL
        AND posts.moderation_status = 'approved'
        AND public.current_patient_can_access_community_group(posts.group_id)
    )
  );

DROP POLICY IF EXISTS community_post_comments_insert_own ON public.community_post_comments;
CREATE POLICY community_post_comments_insert_own ON public.community_post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = community_post_comments.author_id
        AND patients.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.community_posts AS posts
      JOIN public.group_memberships AS memberships
        ON memberships.group_id = posts.group_id
       AND memberships.patient_id = community_post_comments.author_id
       AND memberships.status = 'active'
      WHERE posts.id = community_post_comments.post_id
        AND posts.deleted_at IS NULL
        AND posts.moderation_status = 'approved'
        AND public.community_group_allowed_for_patient(community_post_comments.author_id, posts.group_id)
    )
    AND community_post_comments.deleted_at IS NULL
  );

GRANT SELECT ON public.community_post_comments TO authenticated;
GRANT INSERT ON public.community_post_comments TO authenticated;
GRANT UPDATE ON public.community_posts TO authenticated;

UPDATE public.community_groups
SET required_gender = NULL
WHERE slug IN (
  'como-prepararme-para-mi-consulta',
  'no-entiendo-mis-estudios',
  'que-controles-me-tocan-segun-mi-edad',
  'mi-presion-esta-alta',
  'mi-peso-esta-afectando-mi-salud',
  'puede-ser-baja-testosterona',
  'sueno-ansiedad-y-estres'
);

INSERT INTO public.community_groups (
  name,
  slug,
  description,
  category,
  icon,
  tags,
  required_gender
)
VALUES
  (
    'Solo mujeres',
    'solo-mujeres',
    'Un espacio entre mujeres para conversar temas de salud, cuerpo y experiencias compartidas.',
    'sexo',
    'venus',
    ARRAY['mujeres', 'salud-femenina', 'acompanamiento']::text[],
    'female'
  ),
  (
    'Solo varones',
    'solo-varones',
    'Un espacio entre varones para preguntar con confianza sobre salud, cuerpo y cambios personales.',
    'sexo',
    'mars',
    ARRAY['varones', 'salud-masculina', 'acompanamiento']::text[],
    'male'
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  tags = EXCLUDED.tags,
  required_gender = EXCLUDED.required_gender,
  deleted_at = NULL,
  updated_at = now();

INSERT INTO public.community_posts (
  group_id,
  author_id,
  author_display_name,
  is_anonymous,
  title,
  content,
  tags,
  moderation_status
)
SELECT groups.id, NULL, 'Anónimo', true, seed.title, seed.content, seed.tags, 'approved'
FROM (
  VALUES
    (
      'solo-mujeres',
      'Me costó hablar de cambios hormonales y este espacio ayuda',
      'A veces cuesta encontrar un lugar tranquilo para preguntar sin vergüenza. La idea es poder hacerlo entre mujeres.',
      ARRAY['mujeres', 'hormonas']::text[]
    ),
    (
      'solo-varones',
      'Entre varones también hace falta preguntar sin vergüenza',
      'Hay temas que muchos dejan pasar por pudor. Este grupo busca que esas preguntas tengan un lugar simple y respetuoso.',
      ARRAY['varones', 'salud']::text[]
    )
) AS seed(slug, title, content, tags)
JOIN public.community_groups AS groups
  ON groups.slug = seed.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.community_posts AS posts
  WHERE posts.group_id = groups.id
    AND posts.title = seed.title
    AND posts.deleted_at IS NULL
);

SELECT public.sync_community_group_counts(groups.id)
FROM public.community_groups AS groups;

SELECT public.sync_community_post_comments(posts.id)
FROM public.community_posts AS posts;
