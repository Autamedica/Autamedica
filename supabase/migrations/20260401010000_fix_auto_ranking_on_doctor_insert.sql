-- Fix: auto_create_ranking_metrics must recalculate positions
-- so newly registered doctors get a rank_position immediately
-- instead of staying NULL until some other event triggers recalc.

CREATE OR REPLACE FUNCTION public.auto_create_ranking_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.doctor_ranking_metrics (doctor_id)
  VALUES (NEW.id)
  ON CONFLICT (doctor_id) DO NOTHING;

  -- Assign rank positions so the new doctor appears in the leaderboard
  PERFORM public.recalculate_doctor_ranking_positions();

  RETURN NEW;
END;
$$;
