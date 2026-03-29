-- ============================================================
-- Migration: Create patient community foundation
-- Date: 2026-03-27
-- Purpose: Persist real community groups, memberships, posts and reactions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  category text,
  icon text,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  member_count integer NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  post_count integer NOT NULL DEFAULT 0 CHECK (post_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'muted', 'left')),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator')),
  post_count integer NOT NULL DEFAULT 0 CHECK (post_count >= 0),
  comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  helpful_reactions_received integer NOT NULL DEFAULT 0 CHECK (helpful_reactions_received >= 0),
  last_active timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_memberships_group_patient_key UNIQUE (group_id, patient_id)
);

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.community_groups(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  author_display_name text,
  is_anonymous boolean NOT NULL DEFAULT false,
  title text,
  content text NOT NULL CHECK (char_length(trim(content)) >= 3),
  tags text[] NOT NULL DEFAULT '{}'::text[],
  moderation_status text NOT NULL DEFAULT 'approved'
    CHECK (moderation_status IN ('approved', 'pending_review', 'hidden')),
  reaction_count integer NOT NULL DEFAULT 0 CHECK (reaction_count >= 0),
  comment_count integer NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.post_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  reaction_type text NOT NULL DEFAULT 'like' CHECK (reaction_type IN ('like', 'helpful')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_reactions_post_patient_key UNIQUE (post_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_community_groups_slug ON public.community_groups(slug);
CREATE INDEX IF NOT EXISTS idx_community_groups_deleted_at ON public.community_groups(deleted_at);
CREATE INDEX IF NOT EXISTS idx_group_memberships_patient_status
  ON public.group_memberships(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_status
  ON public.group_memberships(group_id, status);
CREATE INDEX IF NOT EXISTS idx_community_posts_group_created_at
  ON public.community_posts(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_status_created_at
  ON public.community_posts(moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_deleted_at ON public.community_posts(deleted_at);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_patient_id ON public.post_reactions(patient_id);

CREATE OR REPLACE FUNCTION public.touch_community_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_community_group_counts(target_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_groups AS groups
  SET
    member_count = (
      SELECT count(*)
      FROM public.group_memberships AS memberships
      WHERE memberships.group_id = target_group_id
        AND memberships.status = 'active'
    ),
    post_count = (
      SELECT count(*)
      FROM public.community_posts AS posts
      WHERE posts.group_id = target_group_id
        AND posts.deleted_at IS NULL
        AND posts.moderation_status = 'approved'
    ),
    updated_at = now()
  WHERE groups.id = target_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_community_post_reactions(target_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_posts AS posts
  SET
    reaction_count = (
      SELECT count(*)
      FROM public.post_reactions AS reactions
      WHERE reactions.post_id = target_post_id
    ),
    updated_at = now()
  WHERE posts.id = target_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_group_membership_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_community_group_counts(COALESCE(NEW.group_id, OLD.group_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_community_post_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.group_id IS DISTINCT FROM NEW.group_id THEN
    PERFORM public.sync_community_group_counts(OLD.group_id);
  END IF;

  PERFORM public.sync_community_group_counts(COALESCE(NEW.group_id, OLD.group_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_post_reaction_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_community_post_reactions(COALESCE(NEW.post_id, OLD.post_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_community_groups_updated_at ON public.community_groups;
CREATE TRIGGER trg_touch_community_groups_updated_at
  BEFORE UPDATE ON public.community_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_community_updated_at();

DROP TRIGGER IF EXISTS trg_touch_group_memberships_updated_at ON public.group_memberships;
CREATE TRIGGER trg_touch_group_memberships_updated_at
  BEFORE UPDATE ON public.group_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_community_updated_at();

DROP TRIGGER IF EXISTS trg_touch_community_posts_updated_at ON public.community_posts;
CREATE TRIGGER trg_touch_community_posts_updated_at
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_community_updated_at();

DROP TRIGGER IF EXISTS trg_touch_post_reactions_updated_at ON public.post_reactions;
CREATE TRIGGER trg_touch_post_reactions_updated_at
  BEFORE UPDATE ON public.post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_community_updated_at();

DROP TRIGGER IF EXISTS trg_group_membership_counts ON public.group_memberships;
CREATE TRIGGER trg_group_membership_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.group_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_membership_counts();

DROP TRIGGER IF EXISTS trg_community_post_counts ON public.community_posts;
CREATE TRIGGER trg_community_post_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_community_post_counts();

DROP TRIGGER IF EXISTS trg_post_reaction_counts ON public.post_reactions;
CREATE TRIGGER trg_post_reaction_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_post_reaction_counts();

ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_groups_select_all ON public.community_groups;
CREATE POLICY community_groups_select_all ON public.community_groups
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

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
    AND group_memberships.status = 'active'
    AND group_memberships.role = 'member'
    AND group_memberships.post_count = 0
    AND group_memberships.comment_count = 0
    AND group_memberships.helpful_reactions_received = 0
  );

DROP POLICY IF EXISTS community_posts_select_approved ON public.community_posts;
CREATE POLICY community_posts_select_approved ON public.community_posts
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND moderation_status = 'approved');

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
    AND community_posts.deleted_at IS NULL
    AND community_posts.moderation_status = 'approved'
    AND community_posts.reaction_count = 0
    AND community_posts.comment_count = 0
    AND community_posts.view_count = 0
  );

DROP POLICY IF EXISTS post_reactions_select_all ON public.post_reactions;
CREATE POLICY post_reactions_select_all ON public.post_reactions
  FOR SELECT TO authenticated
  USING (true);

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

GRANT SELECT ON public.community_groups TO authenticated;
GRANT SELECT, INSERT ON public.group_memberships TO authenticated;
GRANT SELECT, INSERT ON public.community_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.post_reactions TO authenticated;

INSERT INTO public.community_groups (name, slug, description, category, icon, tags)
VALUES
  (
    'Cómo prepararme para mi consulta',
    'como-prepararme-para-mi-consulta',
    'Qué conviene llevar, qué preguntar y cómo llegar más ordenado a la consulta.',
    'consulta',
    'stethoscope',
    ARRAY['consulta', 'preguntas', 'orden']::text[]
  ),
  (
    'No entiendo mis estudios',
    'no-entiendo-mis-estudios',
    'Un espacio para ordenar dudas antes de hablar con tu médico.',
    'informes',
    'file-text',
    ARRAY['estudios', 'informes', 'resultados']::text[]
  ),
  (
    'Qué controles me tocan según mi edad',
    'que-controles-me-tocan-segun-mi-edad',
    'Chequeos por etapa de vida explicados en lenguaje simple.',
    'prevencion',
    'calendar-heart',
    ARRAY['edad', 'prevencion', 'chequeos']::text[]
  ),
  (
    'Mi presión está alta',
    'mi-presion-esta-alta',
    'Lecturas, síntomas y cómo encararlo mejor en consulta.',
    'presion',
    'heart-pulse',
    ARRAY['presion', 'corazon', 'tension']::text[]
  ),
  (
    'Mi peso está afectando mi salud',
    'mi-peso-esta-afectando-mi-salud',
    'Hábitos, energía y señales cotidianas para conversar con criterio.',
    'metabolismo',
    'scale',
    ARRAY['peso', 'habitos', 'metabolismo']::text[]
  ),
  (
    'Puede ser baja testosterona',
    'puede-ser-baja-testosterona',
    'Cansancio, deseo sexual y cuándo vale la pena llevar el tema a consulta.',
    'hormonal',
    'shield-plus',
    ARRAY['testosterona', 'hormonas', 'hombre']::text[]
  ),
  (
    'Sueño, ansiedad y estrés',
    'sueno-ansiedad-y-estres',
    'Un espacio para compartir qué ayuda cuando la cabeza y el descanso pesan.',
    'bienestar',
    'moon-star',
    ARRAY['sueno', 'ansiedad', 'estres']::text[]
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  tags = EXCLUDED.tags,
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
      'como-prepararme-para-mi-consulta',
      'Antes de la consulta me sirvió anotar síntomas y dudas',
      'Me ayudó llevar tres cosas: qué me pasa, desde cuándo y qué intenté. La consulta fue mucho más clara.',
      ARRAY['consulta', 'preguntas']::text[]
    ),
    (
      'no-entiendo-mis-estudios',
      'Cuando me llegan estudios nuevos primero marco qué no entiendo',
      'Empecé a subrayar palabras que no entiendo y llevarlas a la consulta. Eso me bajó bastante la ansiedad.',
      ARRAY['estudios', 'dudas']::text[]
    ),
    (
      'mi-presion-esta-alta',
      'Registrar la presión varios días me ordenó la charla con el médico',
      'No me guié por una sola medición. Anotar horario, valores y cómo me sentía hizo que la consulta fuera más útil.',
      ARRAY['presion', 'registro']::text[]
    ),
    (
      'mi-peso-esta-afectando-mi-salud',
      'En mi caso el cansancio fue la señal más clara',
      'Yo no empecé por la balanza sino por la energía, el sueño y el aire al moverme. Eso me ayudó a pedir ayuda a tiempo.',
      ARRAY['peso', 'energia']::text[]
    ),
    (
      'puede-ser-baja-testosterona',
      'Consulté por cansancio y deseo sexual, no por una moda',
      'Lo que más me sirvió fue llevar síntomas concretos y hacerme estudios antes de pensar en cualquier tratamiento.',
      ARRAY['testosterona', 'cansancio']::text[]
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

SELECT public.sync_community_post_reactions(posts.id)
FROM public.community_posts AS posts;
