-- Migration: Fix detect_clinical_anomalies signature to avoid type mismatch
-- Returns TABLE symptom and snomed as TEXT instead of VARCHAR to match clinical_symptom_observations data types

DROP FUNCTION IF EXISTS public.detect_clinical_anomalies();

CREATE OR REPLACE FUNCTION public.detect_clinical_anomalies()
RETURNS TABLE (
  symptom TEXT,
  snomed TEXT,
  last_week_count BIGINT,
  historical_weekly_avg NUMERIC,
  percent_increase NUMERIC,
  is_outbreak_warning BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH weekly_stats AS (
    -- Count of cases for each symptom in the last 7 days
    SELECT 
      symptom_name,
      snomed_code,
      COUNT(*) as last_week
    FROM public.clinical_symptom_observations
    WHERE created_at >= now() - INTERVAL '7 days'
      AND is_red_flag = false
    GROUP BY symptom_name, snomed_code
  ),
  historical_stats AS (
    -- Average count of cases per week historically
    SELECT 
      symptom_name,
      snomed_code,
      COALESCE(COUNT(*) / GREATEST(EXTRACT(epoch FROM (now() - MIN(created_at))) / 604800, 1), 0)::NUMERIC as weekly_avg
    FROM public.clinical_symptom_observations
    WHERE created_at < now() - INTERVAL '7 days'
      AND is_red_flag = false
    GROUP BY symptom_name, snomed_code
  )
  SELECT 
    w.symptom_name as symptom,
    w.snomed_code as snomed,
    w.last_week as last_week_count,
    ROUND(h.weekly_avg, 2) as historical_weekly_avg,
    ROUND(((w.last_week - h.weekly_avg) / GREATEST(h.weekly_avg, 1)) * 100, 2) as percent_increase,
    CASE 
      WHEN w.last_week >= 5 AND ((w.last_week - h.weekly_avg) / GREATEST(h.weekly_avg, 1)) >= 0.25 THEN true
      ELSE false
    END as is_outbreak_warning
  FROM weekly_stats w
  JOIN historical_stats h ON w.symptom_name = h.symptom_name
  ORDER BY percent_increase DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
