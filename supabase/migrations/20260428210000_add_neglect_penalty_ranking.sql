-- Migration: Add neglect penalty to doctor ranking system
-- Purpose: Penalize doctors who have assigned patients without recent medical attention

-- 1. Add columns to doctor_ranking_metrics
ALTER TABLE public.doctor_ranking_metrics 
ADD COLUMN IF NOT EXISTS neglect_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS neglect_penalty numeric(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.doctor_ranking_metrics.neglect_count IS 'Number of assigned patients with no completed appointments in the last 15 days';
COMMENT ON COLUMN public.doctor_ranking_metrics.neglect_penalty IS 'Points subtracted from overall_score due to patient neglect';

-- 2. Update recalculate_doctor_metrics to include neglect logic
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
  v_overall numeric(5,2);
  v_last_review timestamptz;
  v_neglect_count integer := 0;
  v_neglect_penalty numeric(5,2) := 0;
BEGIN
  -- Review aggregates (only approved reviews)
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
  WHERE doctor_id = target_doctor_id AND status = 'approved';

  -- Appointment stats
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO v_total_consult, v_completed
  FROM public.appointments
  WHERE doctor_id = target_doctor_id;

  v_completion_rate := CASE WHEN v_total_consult > 0
    THEN ROUND((v_completed::numeric / v_total_consult) * 100, 2)
    ELSE 0
  END;

  -- Neglect Calculation: Assigned patients with no completed appointments in last 15 days
  SELECT COUNT(*)
  INTO v_neglect_count
  FROM public.patient_care_team pct
  WHERE pct.doctor_id = target_doctor_id
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.doctor_id = target_doctor_id
        AND a.patient_id = pct.patient_id
        AND a.status = 'completed'
        AND a.start_time > (now() - interval '15 days')
    );

  -- Penalty: 5 points per neglected patient, capped at 50 points
  v_neglect_penalty := LEAST(v_neglect_count * 5.0, 50.0);

  -- Overall score: weighted composite
  -- 40% avg_rating, 20% completion_rate, 15% communication, 15% clinical_quality, 10% volume bonus
  -- THEN subtract neglect penalty
  v_overall := ROUND(
    (COALESCE(v_avg_rating, 0) / 5.0 * 40) +
    (COALESCE(v_completion_rate, 0) / 100.0 * 20) +
    (COALESCE(v_avg_comm, 0) / 5.0 * 15) +
    (COALESCE(v_avg_clin, 0) / 5.0 * 15) +
    (LEAST(v_total_reviews, 50) / 50.0 * 10) -
    v_neglect_penalty,
  2);

  -- Ensure score doesn't go below zero
  v_overall := GREATEST(v_overall, 0);

  -- Upsert metrics
  INSERT INTO public.doctor_ranking_metrics (
    doctor_id, avg_rating, total_reviews, total_consultations,
    completed_consultations, completion_rate,
    avg_punctuality, avg_communication, avg_professionalism,
    avg_clinical_quality, overall_score, neglect_count, neglect_penalty,
    last_review_at, recalculated_at
  ) VALUES (
    target_doctor_id, v_avg_rating, v_total_reviews, v_total_consult,
    v_completed, v_completion_rate,
    v_avg_punct, v_avg_comm, v_avg_prof,
    v_avg_clin, v_overall, v_neglect_count, v_neglect_penalty,
    v_last_review, now()
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
    neglect_count = EXCLUDED.neglect_count,
    neglect_penalty = EXCLUDED.neglect_penalty,
    overall_score = EXCLUDED.overall_score,
    last_review_at = EXCLUDED.last_review_at,
    recalculated_at = now();
END;
$$;
