-- Auto-create ranking metrics row when a new doctor is inserted
-- This ensures every registered doctor appears in the ranking system

CREATE OR REPLACE FUNCTION public.auto_create_ranking_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.doctor_ranking_metrics (doctor_id)
  VALUES (NEW.id)
  ON CONFLICT (doctor_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_ranking_on_doctor_insert
  AFTER INSERT ON public.doctors
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_ranking_metrics();

-- Backfill: ensure ALL existing doctors have a ranking metrics row
INSERT INTO public.doctor_ranking_metrics (doctor_id)
SELECT id FROM public.doctors
WHERE id NOT IN (SELECT doctor_id FROM public.doctor_ranking_metrics)
ON CONFLICT DO NOTHING;
