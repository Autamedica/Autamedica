-- Clinical observability core schema
-- Author: Codex
-- Context: Coherent tables for patient quick actions + alerting

-- ============================================================================
-- 1. TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vital_signs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  recorded_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'blood_pressure',
  blood_pressure_systolic smallint,
  blood_pressure_diastolic smallint,
  heart_rate smallint,
  temperature numeric(4, 1),
  oxygen_saturation smallint,
  respiratory_rate smallint,
  weight numeric(5, 2),
  height smallint,
  bmi numeric(5, 2),
  pain_scale smallint,
  unit text,
  notes text,
  measurement_context text NOT NULL DEFAULT 'patient_self_report',
  measured_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT vital_signs_type_check CHECK (type IN (
    'blood_pressure',
    'heart_rate',
    'temperature',
    'oxygen_saturation',
    'respiratory_rate',
    'weight',
    'height',
    'pain_scale',
    'composite'
  )),
  CONSTRAINT vital_signs_systolic_range CHECK (
    blood_pressure_systolic IS NULL OR blood_pressure_systolic BETWEEN 40 AND 300
  ),
  CONSTRAINT vital_signs_diastolic_range CHECK (
    blood_pressure_diastolic IS NULL OR blood_pressure_diastolic BETWEEN 20 AND 200
  ),
  CONSTRAINT vital_signs_heart_rate_range CHECK (
    heart_rate IS NULL OR heart_rate BETWEEN 20 AND 260
  ),
  CONSTRAINT vital_signs_temperature_range CHECK (
    temperature IS NULL OR temperature BETWEEN 30.0 AND 45.0
  ),
  CONSTRAINT vital_signs_oxygen_range CHECK (
    oxygen_saturation IS NULL OR oxygen_saturation BETWEEN 50 AND 100
  ),
  CONSTRAINT vital_signs_respiratory_range CHECK (
    respiratory_rate IS NULL OR respiratory_rate BETWEEN 5 AND 80
  ),
  CONSTRAINT vital_signs_weight_range CHECK (
    weight IS NULL OR weight BETWEEN 1 AND 500
  ),
  CONSTRAINT vital_signs_height_range CHECK (
    height IS NULL OR height BETWEEN 30 AND 280
  ),
  CONSTRAINT vital_signs_bmi_range CHECK (
    bmi IS NULL OR bmi BETWEEN 5 AND 100
  ),
  CONSTRAINT vital_signs_pain_scale_range CHECK (
    pain_scale IS NULL OR pain_scale BETWEEN 0 AND 10
  ),
  CONSTRAINT vital_signs_bp_required CHECK (
    type <> 'blood_pressure'
    OR (blood_pressure_systolic IS NOT NULL AND blood_pressure_diastolic IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.medication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  logged_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  medication_name text NOT NULL,
  dosage text NOT NULL,
  status text NOT NULL DEFAULT 'taken',
  notes text,
  source text NOT NULL DEFAULT 'patient_portal',
  taken_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT medication_logs_status_check CHECK (status IN ('taken', 'late', 'skipped')),
  CONSTRAINT medication_logs_source_check CHECK (source IN ('patient_portal', 'doctor_portal', 'import'))
);

CREATE TABLE IF NOT EXISTS public.symptom_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  reported_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  symptom_name text NOT NULL,
  severity smallint NOT NULL,
  description text,
  duration text,
  frequency text,
  triggers text,
  body_location text,
  is_urgent boolean NOT NULL DEFAULT false,
  reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT symptom_reports_severity_check CHECK (severity BETWEEN 1 AND 10)
);

CREATE TABLE IF NOT EXISTS public.lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  uploaded_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  test_type text NOT NULL,
  test_date date NOT NULL,
  laboratory_name text,
  file_url text,
  file_type text,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT lab_results_status_check CHECK (status IN ('pending', 'reviewed', 'flagged')),
  CONSTRAINT lab_results_reviewed_consistency CHECK (
    (status = 'reviewed' AND reviewed_at IS NOT NULL)
    OR (status <> 'reviewed')
  )
);

CREATE TABLE IF NOT EXISTS public.patient_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_record_id uuid NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT patient_alerts_source_table_check CHECK (
    source_table IN ('vital_signs', 'medication_logs', 'symptom_reports', 'lab_results')
  ),
  CONSTRAINT patient_alerts_severity_check CHECK (
    severity IN ('info', 'medium', 'high', 'critical')
  ),
  CONSTRAINT patient_alerts_status_check CHECK (
    status IN ('open', 'acknowledged', 'resolved')
  )
);

-- ============================================================================
-- 2. FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_clinical_observability_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vital_signs_updated_at ON public.vital_signs;
CREATE TRIGGER trg_vital_signs_updated_at
  BEFORE UPDATE ON public.vital_signs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_observability_updated_at();

DROP TRIGGER IF EXISTS trg_medication_logs_updated_at ON public.medication_logs;
CREATE TRIGGER trg_medication_logs_updated_at
  BEFORE UPDATE ON public.medication_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_observability_updated_at();

DROP TRIGGER IF EXISTS trg_symptom_reports_updated_at ON public.symptom_reports;
CREATE TRIGGER trg_symptom_reports_updated_at
  BEFORE UPDATE ON public.symptom_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_observability_updated_at();

DROP TRIGGER IF EXISTS trg_lab_results_updated_at ON public.lab_results;
CREATE TRIGGER trg_lab_results_updated_at
  BEFORE UPDATE ON public.lab_results
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_observability_updated_at();

DROP TRIGGER IF EXISTS trg_patient_alerts_updated_at ON public.patient_alerts;
CREATE TRIGGER trg_patient_alerts_updated_at
  BEFORE UPDATE ON public.patient_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_clinical_observability_updated_at();

CREATE OR REPLACE FUNCTION public.current_patient_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.patients p
  WHERE p.user_id = auth.uid()
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_patient_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_patient_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_patient_alert(
  p_patient_id uuid,
  p_source_table text,
  p_source_record_id uuid,
  p_severity text,
  p_title text,
  p_message text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_created_by_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
BEGIN
  INSERT INTO public.patient_alerts (
    patient_id,
    source_table,
    source_record_id,
    severity,
    title,
    message,
    metadata,
    created_by_id
  ) VALUES (
    p_patient_id,
    p_source_table,
    p_source_record_id,
    p_severity,
    p_title,
    p_message,
    COALESCE(p_metadata, '{}'::jsonb),
    p_created_by_id
  )
  RETURNING id INTO v_alert_id;

  RETURN v_alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_alert(uuid, text, uuid, text, text, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_patient_alert(uuid, text, uuid, text, text, text, jsonb, uuid) TO service_role;

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vital_signs_patient_recorded_at
  ON public.vital_signs(patient_id, recorded_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vital_signs_type_recorded_at
  ON public.vital_signs(type, recorded_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_medication_logs_patient_taken_at
  ON public.medication_logs(patient_id, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_medication_logs_status_taken_at
  ON public.medication_logs(status, taken_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_symptom_reports_patient_reported_at
  ON public.symptom_reports(patient_id, reported_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_symptom_reports_urgent
  ON public.symptom_reports(patient_id, is_urgent, reported_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lab_results_patient_test_date
  ON public.lab_results(patient_id, test_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lab_results_status_test_date
  ON public.lab_results(status, test_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_alerts_patient_status_created_at
  ON public.patient_alerts(patient_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_alerts_open_severity
  ON public.patient_alerts(severity, created_at DESC)
  WHERE status = 'open' AND deleted_at IS NULL;

-- ============================================================================
-- 4. RLS
-- ============================================================================

ALTER TABLE public.vital_signs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vital_signs'
      AND policyname = 'vital_signs_patient_select'
  ) THEN
    DROP POLICY IF EXISTS "vital_signs_patient_select" ON public.vital_signs;
    CREATE POLICY "vital_signs_patient_select"
      ON public.vital_signs FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = vital_signs.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vital_signs'
      AND policyname = 'vital_signs_patient_insert'
  ) THEN
    DROP POLICY IF EXISTS "vital_signs_patient_insert" ON public.vital_signs;
    CREATE POLICY "vital_signs_patient_insert"
      ON public.vital_signs FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = vital_signs.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vital_signs'
      AND policyname = 'vital_signs_doctor_select'
  ) THEN
    DROP POLICY IF EXISTS "vital_signs_doctor_select" ON public.vital_signs;
    CREATE POLICY "vital_signs_doctor_select"
      ON public.vital_signs FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patient_care_team pct
          JOIN public.doctors d ON d.id = pct.doctor_id
          WHERE pct.patient_id = vital_signs.patient_id
            AND d.user_id = auth.uid()
            AND COALESCE(pct.active, true) = true
            AND d.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medication_logs'
      AND policyname = 'medication_logs_patient_select'
  ) THEN
    DROP POLICY IF EXISTS "medication_logs_patient_select" ON public.medication_logs;
    CREATE POLICY "medication_logs_patient_select"
      ON public.medication_logs FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = medication_logs.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medication_logs'
      AND policyname = 'medication_logs_patient_insert'
  ) THEN
    DROP POLICY IF EXISTS "medication_logs_patient_insert" ON public.medication_logs;
    CREATE POLICY "medication_logs_patient_insert"
      ON public.medication_logs FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = medication_logs.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'medication_logs'
      AND policyname = 'medication_logs_doctor_select'
  ) THEN
    DROP POLICY IF EXISTS "medication_logs_doctor_select" ON public.medication_logs;
    CREATE POLICY "medication_logs_doctor_select"
      ON public.medication_logs FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patient_care_team pct
          JOIN public.doctors d ON d.id = pct.doctor_id
          WHERE pct.patient_id = medication_logs.patient_id
            AND d.user_id = auth.uid()
            AND COALESCE(pct.active, true) = true
            AND d.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'symptom_reports'
      AND policyname = 'symptom_reports_patient_select'
  ) THEN
    DROP POLICY IF EXISTS "symptom_reports_patient_select" ON public.symptom_reports;
    CREATE POLICY "symptom_reports_patient_select"
      ON public.symptom_reports FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = symptom_reports.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'symptom_reports'
      AND policyname = 'symptom_reports_patient_insert'
  ) THEN
    DROP POLICY IF EXISTS "symptom_reports_patient_insert" ON public.symptom_reports;
    CREATE POLICY "symptom_reports_patient_insert"
      ON public.symptom_reports FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = symptom_reports.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'symptom_reports'
      AND policyname = 'symptom_reports_doctor_select'
  ) THEN
    DROP POLICY IF EXISTS "symptom_reports_doctor_select" ON public.symptom_reports;
    CREATE POLICY "symptom_reports_doctor_select"
      ON public.symptom_reports FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patient_care_team pct
          JOIN public.doctors d ON d.id = pct.doctor_id
          WHERE pct.patient_id = symptom_reports.patient_id
            AND d.user_id = auth.uid()
            AND COALESCE(pct.active, true) = true
            AND d.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lab_results'
      AND policyname = 'lab_results_patient_select'
  ) THEN
    DROP POLICY IF EXISTS "lab_results_patient_select" ON public.lab_results;
    CREATE POLICY "lab_results_patient_select"
      ON public.lab_results FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = lab_results.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lab_results'
      AND policyname = 'lab_results_patient_insert'
  ) THEN
    DROP POLICY IF EXISTS "lab_results_patient_insert" ON public.lab_results;
    CREATE POLICY "lab_results_patient_insert"
      ON public.lab_results FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = lab_results.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lab_results'
      AND policyname = 'lab_results_doctor_select'
  ) THEN
    DROP POLICY IF EXISTS "lab_results_doctor_select" ON public.lab_results;
    CREATE POLICY "lab_results_doctor_select"
      ON public.lab_results FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patient_care_team pct
          JOIN public.doctors d ON d.id = pct.doctor_id
          WHERE pct.patient_id = lab_results.patient_id
            AND d.user_id = auth.uid()
            AND COALESCE(pct.active, true) = true
            AND d.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'patient_alerts'
      AND policyname = 'patient_alerts_patient_select'
  ) THEN
    DROP POLICY IF EXISTS "patient_alerts_patient_select" ON public.patient_alerts;
    CREATE POLICY "patient_alerts_patient_select"
      ON public.patient_alerts FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = patient_alerts.patient_id
            AND p.user_id = auth.uid()
            AND p.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'patient_alerts'
      AND policyname = 'patient_alerts_doctor_select'
  ) THEN
    DROP POLICY IF EXISTS "patient_alerts_doctor_select" ON public.patient_alerts;
    CREATE POLICY "patient_alerts_doctor_select"
      ON public.patient_alerts FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patient_care_team pct
          JOIN public.doctors d ON d.id = pct.doctor_id
          WHERE pct.patient_id = patient_alerts.patient_id
            AND d.user_id = auth.uid()
            AND COALESCE(pct.active, true) = true
            AND d.deleted_at IS NULL
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'patient_alerts'
      AND policyname = 'patient_alerts_doctor_update'
  ) THEN
    DROP POLICY IF EXISTS "patient_alerts_doctor_update" ON public.patient_alerts;
    CREATE POLICY "patient_alerts_doctor_update"
      ON public.patient_alerts FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.patient_care_team pct
          JOIN public.doctors d ON d.id = pct.doctor_id
          WHERE pct.patient_id = patient_alerts.patient_id
            AND d.user_id = auth.uid()
            AND COALESCE(pct.active, true) = true
            AND d.deleted_at IS NULL
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.patient_care_team pct
          JOIN public.doctors d ON d.id = pct.doctor_id
          WHERE pct.patient_id = patient_alerts.patient_id
            AND d.user_id = auth.uid()
            AND COALESCE(pct.active, true) = true
            AND d.deleted_at IS NULL
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 5. PRIVILEGES
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON TABLE public.vital_signs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.medication_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.symptom_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.lab_results TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.patient_alerts TO authenticated;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.vital_signs IS 'Patient and doctor recorded vital sign measurements';
COMMENT ON TABLE public.medication_logs IS 'Medication intake adherence logs';
COMMENT ON TABLE public.symptom_reports IS 'Patient symptom reports with urgency/severity';
COMMENT ON TABLE public.lab_results IS 'Uploaded laboratory and imaging result metadata';
COMMENT ON TABLE public.patient_alerts IS 'Operational clinical alerts created from observations';
COMMENT ON FUNCTION public.current_patient_id() IS 'Returns patient.id for current authenticated user';
COMMENT ON FUNCTION public.create_patient_alert(uuid, text, uuid, text, text, text, jsonb, uuid) IS 'Creates a clinical alert row and returns alert id';
