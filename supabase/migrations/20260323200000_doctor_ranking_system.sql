-- Doctor Ranking System: reviews, metrics, badges
-- Depends on: doctors, patients, appointments, profiles

-- ============================================================
-- 1. ENUMS
-- ============================================================

CREATE TYPE public.review_status AS ENUM ('pending', 'approved', 'flagged', 'removed');
CREATE TYPE public.badge_type AS ENUM (
  'clinical_excellence',
  'patient_favorite',
  'punctuality_star',
  'high_volume',
  'mentor',
  'early_adopter',
  'zero_no_show',
  'telemedicine_pioneer'
);
CREATE TYPE public.badge_level AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- ============================================================
-- 2. DOCTOR REVIEWS (patient feedback after completed appointments)
-- ============================================================

CREATE TABLE public.doctor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,

  overall_rating smallint NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  punctuality_rating smallint CHECK (punctuality_rating BETWEEN 1 AND 5),
  communication_rating smallint CHECK (communication_rating BETWEEN 1 AND 5),
  professionalism_rating smallint CHECK (professionalism_rating BETWEEN 1 AND 5),
  clinical_quality_rating smallint CHECK (clinical_quality_rating BETWEEN 1 AND 5),

  comment text,
  is_anonymous boolean NOT NULL DEFAULT false,
  status review_status NOT NULL DEFAULT 'approved',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT one_review_per_appointment UNIQUE (appointment_id)
);

CREATE INDEX idx_doctor_reviews_doctor_id ON public.doctor_reviews(doctor_id);
CREATE INDEX idx_doctor_reviews_patient_id ON public.doctor_reviews(patient_id);
CREATE INDEX idx_doctor_reviews_status ON public.doctor_reviews(status) WHERE status = 'approved';
CREATE INDEX idx_doctor_reviews_created_at ON public.doctor_reviews(created_at DESC);

COMMENT ON TABLE public.doctor_reviews IS 'Patient reviews submitted after completed appointments';

-- ============================================================
-- 3. DOCTOR RANKING METRICS (materialized per-doctor stats)
-- ============================================================

CREATE TABLE public.doctor_ranking_metrics (
  doctor_id uuid PRIMARY KEY REFERENCES public.doctors(id) ON DELETE CASCADE,

  avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  total_reviews integer NOT NULL DEFAULT 0,
  total_consultations integer NOT NULL DEFAULT 0,
  completed_consultations integer NOT NULL DEFAULT 0,
  completion_rate numeric(5,2) NOT NULL DEFAULT 0,
  avg_punctuality numeric(3,2) NOT NULL DEFAULT 0,
  avg_communication numeric(3,2) NOT NULL DEFAULT 0,
  avg_professionalism numeric(3,2) NOT NULL DEFAULT 0,
  avg_clinical_quality numeric(3,2) NOT NULL DEFAULT 0,

  overall_score numeric(5,2) NOT NULL DEFAULT 0,
  rank_position integer,

  last_review_at timestamptz,
  recalculated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ranking_metrics_score ON public.doctor_ranking_metrics(overall_score DESC);
CREATE INDEX idx_ranking_metrics_rank ON public.doctor_ranking_metrics(rank_position ASC);

COMMENT ON TABLE public.doctor_ranking_metrics IS 'Cached ranking metrics per doctor, recalculated on review or appointment changes';

-- ============================================================
-- 4. DOCTOR BADGES (earned achievements)
-- ============================================================

CREATE TABLE public.doctor_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  badge badge_type NOT NULL,
  level badge_level NOT NULL DEFAULT 'bronze',
  description text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_badge_per_doctor UNIQUE (doctor_id, badge)
);

CREATE INDEX idx_doctor_badges_doctor_id ON public.doctor_badges(doctor_id);

COMMENT ON TABLE public.doctor_badges IS 'Achievement badges earned by doctors based on platform activity';

-- ============================================================
-- 5. FUNCTION: Recalculate ranking metrics for a single doctor
-- ============================================================

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

  -- Overall score: weighted composite
  -- 40% avg_rating, 20% completion_rate, 15% communication, 15% clinical_quality, 10% volume bonus
  v_overall := ROUND(
    (COALESCE(v_avg_rating, 0) / 5.0 * 40) +
    (COALESCE(v_completion_rate, 0) / 100.0 * 20) +
    (COALESCE(v_avg_comm, 0) / 5.0 * 15) +
    (COALESCE(v_avg_clin, 0) / 5.0 * 15) +
    (LEAST(v_total_reviews, 50) / 50.0 * 10),
  2);

  -- Upsert metrics
  INSERT INTO public.doctor_ranking_metrics (
    doctor_id, avg_rating, total_reviews, total_consultations,
    completed_consultations, completion_rate,
    avg_punctuality, avg_communication, avg_professionalism,
    avg_clinical_quality, overall_score, last_review_at, recalculated_at
  ) VALUES (
    target_doctor_id, v_avg_rating, v_total_reviews, v_total_consult,
    v_completed, v_completion_rate,
    v_avg_punct, v_avg_comm, v_avg_prof,
    v_avg_clin, v_overall, v_last_review, now()
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
    overall_score = EXCLUDED.overall_score,
    last_review_at = EXCLUDED.last_review_at,
    recalculated_at = now();
END;
$$;

-- ============================================================
-- 6. FUNCTION: Recalculate ALL rankings (positions)
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalculate_all_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate metrics for all active doctors
  PERFORM public.recalculate_doctor_metrics(d.id)
  FROM public.doctors d
  WHERE d.active = true;

  -- Assign rank positions by overall_score descending
  UPDATE public.doctor_ranking_metrics AS m
  SET rank_position = sub.rn
  FROM (
    SELECT doctor_id, ROW_NUMBER() OVER (ORDER BY overall_score DESC, total_reviews DESC) AS rn
    FROM public.doctor_ranking_metrics
  ) sub
  WHERE m.doctor_id = sub.doctor_id;
END;
$$;

-- ============================================================
-- 7. TRIGGER: Auto-recalculate on new/updated review
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_doctor_metrics(OLD.doctor_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalculate_doctor_metrics(NEW.doctor_id);
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_review_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.doctor_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_on_review();

-- ============================================================
-- 8. TRIGGER: Auto-recalculate on appointment status change
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_recalculate_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.recalculate_doctor_metrics(NEW.doctor_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_recalc
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_on_appointment();

-- ============================================================
-- 9. RLS POLICIES
-- ============================================================

ALTER TABLE public.doctor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_ranking_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_badges ENABLE ROW LEVEL SECURITY;

-- doctor_reviews: patients can create reviews for their own completed appointments
CREATE POLICY reviews_patient_insert ON public.doctor_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
    AND appointment_id IN (
      SELECT a.id FROM public.appointments a
      JOIN public.patients p ON a.patient_id = p.id
      WHERE p.user_id = auth.uid() AND a.status = 'completed'
    )
  );

-- doctor_reviews: anyone authenticated can read approved reviews
CREATE POLICY reviews_read_approved ON public.doctor_reviews
  FOR SELECT TO authenticated
  USING (status = 'approved');

-- doctor_reviews: doctors can read all reviews about themselves (including pending)
CREATE POLICY reviews_doctor_read_own ON public.doctor_reviews
  FOR SELECT TO authenticated
  USING (
    doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
  );

-- doctor_reviews: patients can update their own reviews (edit comment, rating)
CREATE POLICY reviews_patient_update_own ON public.doctor_reviews
  FOR UPDATE TO authenticated
  USING (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  )
  WITH CHECK (
    patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  );

-- doctor_ranking_metrics: readable by all authenticated users
CREATE POLICY metrics_read ON public.doctor_ranking_metrics
  FOR SELECT TO authenticated
  USING (true);

-- doctor_badges: readable by all authenticated users
CREATE POLICY badges_read ON public.doctor_badges
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================
-- 10. UPDATED_AT TRIGGER for doctor_reviews
-- ============================================================

CREATE TRIGGER set_updated_at_doctor_reviews
  BEFORE UPDATE ON public.doctor_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 11. Initialize metrics for existing doctors
-- ============================================================

INSERT INTO public.doctor_ranking_metrics (doctor_id)
SELECT id FROM public.doctors WHERE active = true
ON CONFLICT DO NOTHING;

SELECT public.recalculate_all_rankings();
