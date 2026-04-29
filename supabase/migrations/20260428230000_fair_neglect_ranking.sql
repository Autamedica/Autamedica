-- Migration: Fair Ranking System (Neglect Overrides)
-- Purpose: Prevent penalizing doctors who have marked themselves as unavailable/absent

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
  v_neglect_count integer := 0;
  v_neglect_penalty numeric(5,2) := 0;
  v_is_absent_today boolean;
  v_absent_days_last_15 integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_availability_overrides
    WHERE doctor_id = target_doctor_id
      AND override_date = CURRENT_DATE
      AND is_available = false
  ) INTO v_is_absent_today;

  SELECT COUNT(*)::integer INTO v_absent_days_last_15
  FROM public.doctor_availability_overrides
  WHERE doctor_id = target_doctor_id
    AND override_date > CURRENT_DATE - INTERVAL '15 days'
    AND is_available = false;

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

  IF NOT v_is_absent_today THEN
    SELECT COUNT(*)::integer INTO v_neglect_count
    FROM public.patient_care_team pct
    WHERE pct.doctor_id = target_doctor_id
      AND pct.active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.patient_id = pct.patient_id
          AND a.doctor_id = target_doctor_id
          AND a.status = 'completed'
          AND a.start_time > (CURRENT_DATE - (15 + v_absent_days_last_15) * INTERVAL '1 day')
      );

    v_neglect_penalty := LEAST(v_neglect_count * 5, 50);
  ELSE
    SELECT neglect_count, neglect_penalty INTO v_neglect_count, v_neglect_penalty
    FROM public.doctor_ranking_metrics
    WHERE doctor_id = target_doctor_id;
  END IF;

  v_overall := ROUND(
    GREATEST(
      0,
      LEAST(100, COALESCE(v_clinical_score, 0) + (COALESCE(v_community_score, 0) * 0.15)) - COALESCE(v_neglect_penalty, 0)
    ),
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
    neglect_count,
    neglect_penalty,
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
    COALESCE(v_neglect_count, 0),
    COALESCE(v_neglect_penalty, 0),
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
    neglect_count = EXCLUDED.neglect_count,
    neglect_penalty = EXCLUDED.neglect_penalty,
    overall_score = EXCLUDED.overall_score,
    last_review_at = EXCLUDED.last_review_at,
    recalculated_at = now();

  PERFORM public.evaluate_doctor_badges(target_doctor_id);
END;
$$;
