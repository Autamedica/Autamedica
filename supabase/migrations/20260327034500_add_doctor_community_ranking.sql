-- ============================================================
-- Migration: Add doctor community contribution to ranking
-- Date: 2026-03-27
-- Purpose: Let doctors answer in community and reward helpful responses in ranking
-- ============================================================

ALTER TABLE public.community_post_comments
  ADD COLUMN IF NOT EXISTS author_role text,
  ADD COLUMN IF NOT EXISTS doctor_author_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doctor_specialty_snapshot text,
  ADD COLUMN IF NOT EXISTS reaction_count integer NOT NULL DEFAULT 0 CHECK (reaction_count >= 0);

UPDATE public.community_post_comments
SET author_role = 'patient'
WHERE author_role IS NULL;

ALTER TABLE public.community_post_comments
  ALTER COLUMN author_role SET DEFAULT 'patient',
  ALTER COLUMN author_role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_post_comments_author_role_check'
  ) THEN
    ALTER TABLE public.community_post_comments
      ADD CONSTRAINT community_post_comments_author_role_check
      CHECK (author_role IN ('patient', 'doctor'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_post_comments_author_scope_check'
  ) THEN
    ALTER TABLE public.community_post_comments
      ADD CONSTRAINT community_post_comments_author_scope_check
      CHECK (
        (author_role = 'patient' AND author_id IS NOT NULL AND doctor_author_id IS NULL)
        OR (author_role = 'doctor' AND doctor_author_id IS NOT NULL AND author_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_post_comments_doctor_author_id
  ON public.community_post_comments(doctor_author_id)
  WHERE doctor_author_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.community_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.community_post_comments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  reaction_type text NOT NULL DEFAULT 'helpful' CHECK (reaction_type IN ('helpful', 'like')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_comment_reactions_comment_patient_key UNIQUE (comment_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_community_comment_reactions_comment_id
  ON public.community_comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_community_comment_reactions_patient_id
  ON public.community_comment_reactions(patient_id);

ALTER TABLE public.community_comment_reactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_community_comment_reactions(target_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_post_comments AS comments
  SET
    reaction_count = (
      SELECT count(*)
      FROM public.community_comment_reactions AS reactions
      WHERE reactions.comment_id = target_comment_id
    ),
    updated_at = now()
  WHERE comments.id = target_comment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_community_comment_reaction_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_community_comment_reactions(COALESCE(NEW.comment_id, OLD.comment_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_community_comment_reactions_updated_at ON public.community_comment_reactions;
CREATE TRIGGER trg_touch_community_comment_reactions_updated_at
  BEFORE UPDATE ON public.community_comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_community_updated_at();

DROP TRIGGER IF EXISTS trg_community_comment_reaction_counts ON public.community_comment_reactions;
CREATE TRIGGER trg_community_comment_reaction_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.community_comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_community_comment_reaction_counts();

DROP POLICY IF EXISTS community_post_comments_insert_own ON public.community_post_comments;
CREATE POLICY community_post_comments_insert_own ON public.community_post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_role = 'patient'
    AND doctor_author_id IS NULL
    AND EXISTS (
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

DROP POLICY IF EXISTS community_post_comments_insert_doctor ON public.community_post_comments;
CREATE POLICY community_post_comments_insert_doctor ON public.community_post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_role = 'doctor'
    AND author_id IS NULL
    AND doctor_author_id IN (
      SELECT doctors.id
      FROM public.doctors
      WHERE doctors.user_id = auth.uid()
        AND doctors.active = true
    )
    AND EXISTS (
      SELECT 1
      FROM public.community_posts AS posts
      WHERE posts.id = community_post_comments.post_id
        AND posts.deleted_at IS NULL
        AND posts.moderation_status = 'approved'
    )
    AND community_post_comments.deleted_at IS NULL
  );

DROP POLICY IF EXISTS community_comment_reactions_select_visible ON public.community_comment_reactions;
CREATE POLICY community_comment_reactions_select_visible ON public.community_comment_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_post_comments AS comments
      JOIN public.community_posts AS posts
        ON posts.id = comments.post_id
      WHERE comments.id = community_comment_reactions.comment_id
        AND comments.deleted_at IS NULL
        AND comments.author_role = 'doctor'
        AND posts.deleted_at IS NULL
        AND posts.moderation_status = 'approved'
        AND public.current_patient_can_access_community_group(posts.group_id)
    )
  );

DROP POLICY IF EXISTS community_comment_reactions_insert_own ON public.community_comment_reactions;
CREATE POLICY community_comment_reactions_insert_own ON public.community_comment_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = community_comment_reactions.patient_id
        AND patients.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.community_post_comments AS comments
      JOIN public.community_posts AS posts
        ON posts.id = comments.post_id
      WHERE comments.id = community_comment_reactions.comment_id
        AND comments.deleted_at IS NULL
        AND comments.author_role = 'doctor'
        AND comments.doctor_author_id IS NOT NULL
        AND posts.deleted_at IS NULL
        AND posts.moderation_status = 'approved'
        AND public.community_group_allowed_for_patient(community_comment_reactions.patient_id, posts.group_id)
    )
  );

DROP POLICY IF EXISTS community_comment_reactions_update_own ON public.community_comment_reactions;
CREATE POLICY community_comment_reactions_update_own ON public.community_comment_reactions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = community_comment_reactions.patient_id
        AND patients.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients AS patients
      WHERE patients.id = community_comment_reactions.patient_id
        AND patients.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.community_comment_reactions TO authenticated;

ALTER TABLE public.doctor_ranking_metrics
  ADD COLUMN IF NOT EXISTS clinical_score numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS community_replies integer NOT NULL DEFAULT 0 CHECK (community_replies >= 0),
  ADD COLUMN IF NOT EXISTS community_threads_helped integer NOT NULL DEFAULT 0 CHECK (community_threads_helped >= 0),
  ADD COLUMN IF NOT EXISTS community_helpful_reactions integer NOT NULL DEFAULT 0 CHECK (community_helpful_reactions >= 0),
  ADD COLUMN IF NOT EXISTS community_score numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS community_last_activity_at timestamptz;

CREATE OR REPLACE FUNCTION public.recalculate_doctor_ranking_positions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.doctor_ranking_metrics AS metrics
  SET rank_position = ranked.rn
  FROM (
    SELECT
      doctor_id,
      ROW_NUMBER() OVER (
        ORDER BY overall_score DESC, community_helpful_reactions DESC, total_reviews DESC, doctor_id ASC
      ) AS rn
    FROM public.doctor_ranking_metrics
  ) AS ranked
  WHERE metrics.doctor_id = ranked.doctor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_doctor_metrics(target_doctor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_rating numeric(3,2);
  v_total_reviews integer;
  v_total_consult integer;
  v_completed integer;
  v_completion_rate numeric(5,2);
  v_avg_punct numeric(3,2);
  v_avg_comm numeric(3,2);
  v_avg_prof numeric(3,2);
  v_avg_clin numeric(3,2);
  v_clinical_score numeric(5,2);
  v_overall numeric(5,2);
  v_last_review timestamptz;
  v_community_replies integer;
  v_community_threads integer;
  v_community_helpful integer;
  v_community_score numeric(5,2);
  v_community_last_activity timestamptz;
BEGIN
  SELECT
    COALESCE(AVG(overall_rating), 0),
    COUNT(*),
    COALESCE(AVG(punctuality_rating), 0),
    COALESCE(AVG(communication_rating), 0),
    COALESCE(AVG(professionalism_rating), 0),
    COALESCE(AVG(clinical_quality_rating), 0),
    MAX(created_at)
  INTO v_avg_rating, v_total_reviews, v_avg_punct, v_avg_comm, v_avg_prof, v_avg_clin, v_last_review
  FROM public.doctor_reviews
  WHERE doctor_id = target_doctor_id
    AND status = 'approved';

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_consult, v_completed
  FROM public.appointments
  WHERE doctor_id = target_doctor_id;

  SELECT
    COUNT(*),
    COUNT(DISTINCT post_id),
    COALESCE(SUM(reaction_count), 0),
    MAX(created_at)
  INTO v_community_replies, v_community_threads, v_community_helpful, v_community_last_activity
  FROM public.community_post_comments
  WHERE doctor_author_id = target_doctor_id
    AND author_role = 'doctor'
    AND deleted_at IS NULL;

  v_completion_rate := CASE WHEN v_total_consult > 0
    THEN ROUND((v_completed::numeric / v_total_consult) * 100, 2)
    ELSE 0
  END;

  v_clinical_score := ROUND(
    (COALESCE(v_avg_rating, 0) / 5.0 * 40) +
    (COALESCE(v_completion_rate, 0) / 100.0 * 20) +
    (COALESCE(v_avg_comm, 0) / 5.0 * 15) +
    (COALESCE(v_avg_clin, 0) / 5.0 * 15) +
    (LEAST(v_total_reviews, 50) / 50.0 * 10),
  2);

  v_community_score := ROUND(
    (LEAST(COALESCE(v_community_helpful, 0), 120) / 120.0 * 60) +
    (LEAST(COALESCE(v_community_threads, 0), 40) / 40.0 * 25) +
    (LEAST(COALESCE(v_community_replies, 0), 80) / 80.0 * 15),
  2);

  v_overall := ROUND(
    LEAST(100, COALESCE(v_clinical_score, 0) + (COALESCE(v_community_score, 0) * 0.15)),
  2);

  INSERT INTO public.doctor_ranking_metrics (
    doctor_id,
    avg_rating,
    total_reviews,
    total_consultations,
    completed_consultations,
    completion_rate,
    avg_punctuality,
    avg_communication,
    avg_professionalism,
    avg_clinical_quality,
    clinical_score,
    community_replies,
    community_threads_helped,
    community_helpful_reactions,
    community_score,
    community_last_activity_at,
    overall_score,
    last_review_at,
    recalculated_at
  ) VALUES (
    target_doctor_id,
    v_avg_rating,
    v_total_reviews,
    v_total_consult,
    v_completed,
    v_completion_rate,
    v_avg_punct,
    v_avg_comm,
    v_avg_prof,
    v_avg_clin,
    v_clinical_score,
    v_community_replies,
    v_community_threads,
    v_community_helpful,
    v_community_score,
    v_community_last_activity,
    v_overall,
    v_last_review,
    now()
  )
  ON CONFLICT (doctor_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    total_reviews = EXCLUDED.total_reviews,
    total_consultations = EXCLUDED.total_consultations,
    completed_consultations = EXCLUDED.completed_consultations,
    completion_rate = EXCLUDED.completion_rate,
    avg_punctuality = EXCLUDED.avg_punctuality,
    avg_communication = EXCLUDED.avg_communication,
    avg_professionalism = EXCLUDED.avg_professionalism,
    avg_clinical_quality = EXCLUDED.avg_clinical_quality,
    clinical_score = EXCLUDED.clinical_score,
    community_replies = EXCLUDED.community_replies,
    community_threads_helped = EXCLUDED.community_threads_helped,
    community_helpful_reactions = EXCLUDED.community_helpful_reactions,
    community_score = EXCLUDED.community_score,
    community_last_activity_at = EXCLUDED.community_last_activity_at,
    overall_score = EXCLUDED.overall_score,
    last_review_at = EXCLUDED.last_review_at,
    recalculated_at = now();

  PERFORM public.evaluate_doctor_badges(target_doctor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_all_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.recalculate_doctor_metrics(doctors.id)
  FROM public.doctors AS doctors
  WHERE doctors.active = true;

  PERFORM public.recalculate_doctor_ranking_positions();
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_doctor_metrics(OLD.doctor_id);
  ELSE
    PERFORM public.recalculate_doctor_metrics(NEW.doctor_id);
  END IF;

  PERFORM public.recalculate_doctor_ranking_positions();
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.recalculate_doctor_metrics(NEW.doctor_id);
    PERFORM public.recalculate_doctor_ranking_positions();
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_doctor_community_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_doctor_id uuid;
BEGIN
  target_doctor_id := COALESCE(NEW.doctor_author_id, OLD.doctor_author_id);

  IF target_doctor_id IS NOT NULL THEN
    PERFORM public.recalculate_doctor_metrics(target_doctor_id);
    PERFORM public.recalculate_doctor_ranking_positions();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_doctor_community_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_doctor_id uuid;
BEGIN
  SELECT comments.doctor_author_id
  INTO target_doctor_id
  FROM public.community_post_comments AS comments
  WHERE comments.id = COALESCE(NEW.comment_id, OLD.comment_id);

  IF target_doctor_id IS NOT NULL THEN
    PERFORM public.recalculate_doctor_metrics(target_doctor_id);
    PERFORM public.recalculate_doctor_ranking_positions();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_doctor_community_comment_recalc ON public.community_post_comments;
CREATE TRIGGER trg_doctor_community_comment_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.community_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_on_doctor_community_comment();

DROP TRIGGER IF EXISTS trg_doctor_community_reaction_recalc ON public.community_comment_reactions;
CREATE TRIGGER trg_doctor_community_reaction_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.community_comment_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_on_doctor_community_reaction();

SELECT public.recalculate_all_rankings();
