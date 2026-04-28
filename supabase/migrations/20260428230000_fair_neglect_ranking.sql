-- Migration: Fair Ranking System (Neglect Overrides)
-- Purpose: Prevent penalizing doctors who have marked themselves as unavailable/absent

CREATE OR REPLACE FUNCTION public.recalculate_doctor_metrics(target_doctor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_rating numeric;
  v_review_count integer;
  v_completed_appointments integer;
  v_cancelled_appointments integer;
  v_neglect_count integer := 0;
  v_neglect_penalty integer := 0;
  v_is_absent_today boolean;
  v_absent_days_last_15 integer;
BEGIN
  -- 1. Check if doctor is marked as absent TODAY
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_availability_overrides
    WHERE doctor_id = target_doctor_id
      AND override_date = CURRENT_DATE
      AND is_available = false
  ) INTO v_is_absent_today;

  -- 2. Count how many days the doctor was absent in the last 15 days
  SELECT COUNT(*)::integer INTO v_absent_days_last_15
  FROM public.doctor_availability_overrides
  WHERE doctor_id = target_doctor_id
    AND override_date > CURRENT_DATE - INTERVAL '15 days'
    AND is_available = false;

  -- 3. Calculate basic metrics
  SELECT 
    COALESCE(AVG(rating), 0),
    COUNT(*)
  FROM public.doctor_reviews
  WHERE doctor_id = target_doctor_id
  INTO v_avg_rating, v_review_count;

  SELECT COUNT(*)
  FROM public.appointments
  WHERE doctor_id = target_doctor_id AND status = 'completed'
  INTO v_completed_appointments;

  SELECT COUNT(*)
  FROM public.appointments
  WHERE doctor_id = target_doctor_id AND status = 'cancelled'
  INTO v_cancelled_appointments;

  -- 4. Calculate Neglect Penalty (only if NOT absent today)
  -- If doctor is absent today, we preserve previous neglect metrics or skip update
  IF NOT v_is_absent_today THEN
    -- A patient is considered neglected if:
    -- - They are in the care team of the doctor
    -- - They haven't had a completed appointment in the last (15 + absent_days) days
    SELECT COUNT(*)::integer INTO v_neglect_count
    FROM public.patient_care_team pct
    WHERE pct.doctor_id = target_doctor_id
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.patient_id = pct.patient_id
          AND a.doctor_id = target_doctor_id
          AND a.status = 'completed'
          -- We extend the 15-day window by the number of days the doctor was absent
          AND a.start_time > (CURRENT_DATE - (15 + v_absent_days_last_15) * INTERVAL '1 day')
      );

    -- Penalty: 5 points per neglected patient, max 50 points
    v_neglect_penalty := LEAST(v_neglect_count * 5, 50);
  ELSE
    -- If absent, keep current penalty or set to 0 if preferred (here we keep current state)
    SELECT neglect_count, neglect_penalty INTO v_neglect_count, v_neglect_penalty
    FROM public.doctor_ranking_metrics
    WHERE doctor_id = target_doctor_id;
  END IF;

  -- 5. Update ranking metrics
  INSERT INTO public.doctor_ranking_metrics (
    doctor_id,
    avg_rating,
    review_count,
    completed_appointments,
    cancelled_appointments,
    neglect_count,
    neglect_penalty,
    updated_at
  ) VALUES (
    target_doctor_id,
    v_avg_rating,
    v_review_count,
    v_completed_appointments,
    v_cancelled_appointments,
    COALESCE(v_neglect_count, 0),
    COALESCE(v_neglect_penalty, 0),
    NOW()
  )
  ON CONFLICT (doctor_id) DO UPDATE SET
    avg_rating = EXCLUDED.avg_rating,
    review_count = EXCLUDED.review_count,
    completed_appointments = EXCLUDED.completed_appointments,
    cancelled_appointments = EXCLUDED.cancelled_appointments,
    neglect_count = EXCLUDED.neglect_count,
    neglect_penalty = EXCLUDED.neglect_penalty,
    updated_at = EXCLUDED.updated_at;

END;
$$;
