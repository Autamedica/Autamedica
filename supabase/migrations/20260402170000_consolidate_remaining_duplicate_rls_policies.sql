-- Consolidate the remaining duplicate permissive RLS policies reported by the
-- Supabase advisor without widening access beyond the current effective union.

BEGIN;

-- ============================================================================
-- anamnesis_sections
-- ============================================================================

DROP POLICY IF EXISTS "patient_select_anamnesis_sections" ON public.anamnesis_sections;
DROP POLICY IF EXISTS "patient_upsert_anamnesis_sections" ON public.anamnesis_sections;

CREATE POLICY "anamnesis_sections_select_patient"
  ON public.anamnesis_sections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.patient_id = (SELECT auth.uid())
        AND a.deleted_at IS NULL
    )
  );

CREATE POLICY "anamnesis_sections_insert_patient"
  ON public.anamnesis_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.patient_id = (SELECT auth.uid())
        AND a.deleted_at IS NULL
        AND NOT a.locked
        AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
    )
  );

CREATE POLICY "anamnesis_sections_update_patient"
  ON public.anamnesis_sections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.patient_id = (SELECT auth.uid())
        AND a.deleted_at IS NULL
        AND NOT a.locked
        AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.patient_id = (SELECT auth.uid())
        AND a.deleted_at IS NULL
        AND NOT a.locked
        AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
    )
  );

CREATE POLICY "anamnesis_sections_delete_patient"
  ON public.anamnesis_sections
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.anamnesis a
      WHERE a.id = anamnesis_sections.anamnesis_id
        AND a.patient_id = (SELECT auth.uid())
        AND a.deleted_at IS NULL
        AND NOT a.locked
        AND COALESCE(a.status, 'in_progress') NOT IN ('completed', 'under_review', 'approved')
    )
  );

-- ============================================================================
-- community_post_comments
-- ============================================================================

DROP POLICY IF EXISTS "community_post_comments_insert_doctor" ON public.community_post_comments;
DROP POLICY IF EXISTS "community_post_comments_insert_own" ON public.community_post_comments;

CREATE POLICY "community_post_comments_insert_authorized"
  ON public.community_post_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      author_role = 'doctor'
      AND author_id IS NULL
      AND doctor_author_id IN (
        SELECT d.id
        FROM public.doctors d
        WHERE d.user_id = (SELECT auth.uid())
          AND d.active = true
      )
      AND EXISTS (
        SELECT 1
        FROM public.community_posts posts
        WHERE posts.id = community_post_comments.post_id
          AND posts.deleted_at IS NULL
          AND posts.moderation_status = 'approved'
      )
      AND deleted_at IS NULL
    )
    OR
    (
      author_role = 'patient'
      AND doctor_author_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.patients patients
        WHERE patients.id = community_post_comments.author_id
          AND patients.user_id = (SELECT auth.uid())
      )
      AND EXISTS (
        SELECT 1
        FROM public.community_posts posts
        JOIN public.group_memberships memberships
          ON memberships.group_id = posts.group_id
         AND memberships.patient_id = community_post_comments.author_id
         AND memberships.status = 'active'
        WHERE posts.id = community_post_comments.post_id
          AND posts.deleted_at IS NULL
          AND posts.moderation_status = 'approved'
          AND public.community_group_allowed_for_patient(community_post_comments.author_id, posts.group_id)
      )
      AND deleted_at IS NULL
    )
  );

-- ============================================================================
-- companies
-- ============================================================================

DROP POLICY IF EXISTS "Company admins can view own companies" ON public.companies;

-- ============================================================================
-- company_members
-- ============================================================================

DROP POLICY IF EXISTS "Allow admins to manage company members" ON public.company_members;
DROP POLICY IF EXISTS "Allow members to see their own company members" ON public.company_members;

CREATE POLICY "company_members_select_scoped"
  ON public.company_members
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id
      FROM public.company_members cm
      WHERE cm.profile_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "company_members_insert_admin"
  ON public.company_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id
      FROM public.company_members cm
      WHERE cm.profile_id = (SELECT auth.uid())
        AND cm.role = 'admin'
    )
  );

CREATE POLICY "company_members_update_admin"
  ON public.company_members
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id
      FROM public.company_members cm
      WHERE cm.profile_id = (SELECT auth.uid())
        AND cm.role = 'admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id
      FROM public.company_members cm
      WHERE cm.profile_id = (SELECT auth.uid())
        AND cm.role = 'admin'
    )
  );

CREATE POLICY "company_members_delete_admin"
  ON public.company_members
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id
      FROM public.company_members cm
      WHERE cm.profile_id = (SELECT auth.uid())
        AND cm.role = 'admin'
    )
  );

-- ============================================================================
-- doctor_reviews
-- ============================================================================

DROP POLICY IF EXISTS "reviews_doctor_read_own" ON public.doctor_reviews;
DROP POLICY IF EXISTS "reviews_read_approved" ON public.doctor_reviews;

CREATE POLICY "doctor_reviews_select_scoped"
  ON public.doctor_reviews
  FOR SELECT
  TO authenticated
  USING (
    status = 'approved'::public.review_status
    OR doctor_id IN (
      SELECT d.id
      FROM public.doctors d
      WHERE d.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- doctors
-- ============================================================================

DROP POLICY IF EXISTS "Doctors can view own profile" ON public.doctors;
DROP POLICY IF EXISTS "Platform admins can view all doctors" ON public.doctors;

-- ============================================================================
-- lab_results
-- ============================================================================

DROP POLICY IF EXISTS "doctors_read_assigned_lab_results" ON public.lab_results;
DROP POLICY IF EXISTS "patients_read_own_lab_results" ON public.lab_results;

CREATE POLICY "lab_results_select_scoped"
  ON public.lab_results
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.doctor_patient dp
        JOIN public.doctors d ON d.id = dp.doctor_id
        WHERE d.user_id = (SELECT auth.uid())
          AND dp.patient_id = lab_results.patient_id
      )
      OR patient_id IN (
        SELECT patients.id
        FROM public.patients
        WHERE patients.user_id = (SELECT auth.uid())
      )
    )
  );

-- ============================================================================
-- medical_records
-- ============================================================================

DROP POLICY IF EXISTS "Doctors can view care team records" ON public.medical_records;
DROP POLICY IF EXISTS "Patients can view their visible records" ON public.medical_records;
DROP POLICY IF EXISTS "medical_records_select_restricted" ON public.medical_records;

CREATE POLICY "medical_records_select_scoped"
  ON public.medical_records
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.doctors d
        WHERE d.id = medical_records.doctor_id
          AND d.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.patient_care_team pct
        JOIN public.doctors d ON d.id = pct.doctor_id
        WHERE pct.patient_id = medical_records.patient_id
          AND d.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.patients p
        WHERE p.id = medical_records.patient_id
          AND p.user_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1
        FROM public.patients p
        WHERE p.id = medical_records.patient_id
          AND public.doctor_has_patient_access(p.user_id)
      )
      OR public.is_system_admin()
    )
  );

DROP POLICY IF EXISTS "medical_records_insert_authorized" ON public.medical_records;
DROP POLICY IF EXISTS "medical_records_delete_policy" ON public.medical_records;

-- ============================================================================
-- medication_logs
-- ============================================================================

DROP POLICY IF EXISTS "doctors_read_assigned_medication_logs" ON public.medication_logs;
DROP POLICY IF EXISTS "patients_read_own_medication_logs" ON public.medication_logs;

CREATE POLICY "medication_logs_select_scoped"
  ON public.medication_logs
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.doctor_patient dp
        JOIN public.doctors d ON d.id = dp.doctor_id
        WHERE d.user_id = (SELECT auth.uid())
          AND dp.patient_id = medication_logs.patient_id
      )
      OR patient_id IN (
        SELECT patients.id
        FROM public.patients
        WHERE patients.user_id = (SELECT auth.uid())
      )
    )
  );

-- ============================================================================
-- org_members
-- ============================================================================

DROP POLICY IF EXISTS "Org members manage" ON public.org_members;
DROP POLICY IF EXISTS "Org members read" ON public.org_members;

CREATE POLICY "org_members_select_scoped"
  ON public.org_members
  FOR SELECT
  TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = (SELECT auth.uid())
        AND p.role IN ('admin', 'platform_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.org_members owner
      WHERE owner.organization_id = org_members.organization_id
        AND owner.profile_id = (SELECT auth.uid())
        AND owner.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_members_insert_admin"
  ON public.org_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.org_members owner
      WHERE owner.organization_id = org_members.organization_id
        AND owner.profile_id = (SELECT auth.uid())
        AND owner.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_members_update_admin"
  ON public.org_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.org_members owner
      WHERE owner.organization_id = org_members.organization_id
        AND owner.profile_id = (SELECT auth.uid())
        AND owner.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.org_members owner
      WHERE owner.organization_id = org_members.organization_id
        AND owner.profile_id = (SELECT auth.uid())
        AND owner.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_members_delete_admin"
  ON public.org_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.org_members owner
      WHERE owner.organization_id = org_members.organization_id
        AND owner.profile_id = (SELECT auth.uid())
        AND owner.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- patient_alerts
-- ============================================================================

DROP POLICY IF EXISTS "doctors_manage_alerts" ON public.patient_alerts;
DROP POLICY IF EXISTS "doctors_read_assigned_alerts" ON public.patient_alerts;
DROP POLICY IF EXISTS "patients_read_own_alerts" ON public.patient_alerts;

CREATE POLICY "patient_alerts_select_scoped"
  ON public.patient_alerts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctor_patient dp
      JOIN public.doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = (SELECT auth.uid())
        AND dp.patient_id = patient_alerts.patient_id
    )
    OR patient_id IN (
      SELECT patients.id
      FROM public.patients
      WHERE patients.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "patient_alerts_insert_doctor_assigned"
  ON public.patient_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.doctor_patient dp
      JOIN public.doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = (SELECT auth.uid())
        AND dp.patient_id = patient_alerts.patient_id
    )
  );

CREATE POLICY "patient_alerts_update_doctor_assigned"
  ON public.patient_alerts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctor_patient dp
      JOIN public.doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = (SELECT auth.uid())
        AND dp.patient_id = patient_alerts.patient_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.doctor_patient dp
      JOIN public.doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = (SELECT auth.uid())
        AND dp.patient_id = patient_alerts.patient_id
    )
  );

CREATE POLICY "patient_alerts_delete_doctor_assigned"
  ON public.patient_alerts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctor_patient dp
      JOIN public.doctors d ON d.id = dp.doctor_id
      WHERE d.user_id = (SELECT auth.uid())
        AND dp.patient_id = patient_alerts.patient_id
    )
  );

-- ============================================================================
-- symptom_reports
-- ============================================================================

DROP POLICY IF EXISTS "doctors_read_assigned_symptoms" ON public.symptom_reports;
DROP POLICY IF EXISTS "patients_read_own_symptoms" ON public.symptom_reports;

CREATE POLICY "symptom_reports_select_scoped"
  ON public.symptom_reports
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.doctor_patient dp
        JOIN public.doctors d ON d.id = dp.doctor_id
        WHERE d.user_id = (SELECT auth.uid())
          AND dp.patient_id = symptom_reports.patient_id
      )
      OR patient_id IN (
        SELECT patients.id
        FROM public.patients
        WHERE patients.user_id = (SELECT auth.uid())
      )
    )
  );

-- ============================================================================
-- vital_signs
-- ============================================================================

DROP POLICY IF EXISTS "doctors_read_assigned_vitals" ON public.vital_signs;
DROP POLICY IF EXISTS "patients_read_own_vitals" ON public.vital_signs;

CREATE POLICY "vital_signs_select_scoped"
  ON public.vital_signs
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.doctor_patient dp
        JOIN public.doctors d ON d.id = dp.doctor_id
        WHERE d.user_id = (SELECT auth.uid())
          AND dp.patient_id = vital_signs.patient_id
      )
      OR patient_id IN (
        SELECT patients.id
        FROM public.patients
        WHERE patients.user_id = (SELECT auth.uid())
      )
    )
  );

COMMIT;
