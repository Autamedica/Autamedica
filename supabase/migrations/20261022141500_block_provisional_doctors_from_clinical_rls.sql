-- Defense in depth: client-side and web API authorization MUST NOT be the
-- only barrier protecting patients from provisional doctor accounts.
-- Existing active PENDING accounts remain unchanged; only clinical access
-- through these RLS predicates is restricted.
-- Release requires review of active historical PENDING accounts and care continuity.

CREATE OR REPLACE FUNCTION public.is_doctor()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.doctors d
    WHERE d.user_id = auth.uid()
      AND d.active IS TRUE
      AND NULLIF(pg_catalog.btrim(d.license_number), '') IS NOT NULL
      AND pg_catalog.upper(pg_catalog.btrim(d.license_number))
        OPERATOR(pg_catalog.!~) '^PENDING(-|$)'
  );
END;
$function$;

-- Maintain the existing API grants on is_doctor; this function now authorizes
-- a verified-format practitioner only. Official credential approval still
-- requires a human audit of the issuing medical registry.

-- Doctors require clinical approval to SELECT their own or assigned patient's
-- medical records; the patient/administrator branches are preserved.
ALTER POLICY medical_records_select_scoped ON public.medical_records
  USING (
    deleted_at IS NULL
    AND (
      public.is_system_admin()
      OR EXISTS (
        SELECT 1 FROM public.patients p
        WHERE p.id = medical_records.patient_id
          AND p.user_id = (SELECT auth.uid())
      )
      OR (
        public.is_doctor()
        AND (
          EXISTS (
            SELECT 1 FROM public.doctors d
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
            SELECT 1 FROM public.patients p
            WHERE p.id = medical_records.patient_id
              AND public.doctor_has_patient_access(p.user_id)
          )
        )
      )
    )
  );

ALTER POLICY medical_records_soft_delete ON public.medical_records
  USING (
    deleted_at IS NULL
    AND (
      public.is_system_admin()
      OR (
        public.is_doctor()
        AND EXISTS (
          SELECT 1 FROM public.doctors d
          WHERE d.id = medical_records.doctor_id
            AND d.user_id = (SELECT auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    deleted_at IS NOT NULL
    AND (
      public.is_system_admin()
      OR (
        public.is_doctor()
        AND EXISTS (
          SELECT 1 FROM public.doctors d
          WHERE d.id = medical_records.doctor_id
            AND d.user_id = (SELECT auth.uid())
        )
      )
    )
  );

-- Medical orders: only approved doctors can create, read or update drafts.
-- Patients retain their independent SELECT policy.
ALTER POLICY "Doctors can insert their own medical orders" ON public.medical_orders
  WITH CHECK (
    public.is_doctor()
    AND doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  );

ALTER POLICY "Doctors can view their own medical orders" ON public.medical_orders
  USING (
    public.is_doctor()
    AND doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  );

ALTER POLICY "Doctors can update their own draft medical orders" ON public.medical_orders
  USING (
    public.is_doctor()
    AND doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'draft'::text
    AND public.is_doctor()
    AND doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  );

-- Certificates: same doctor gate, with independent patient access preserved.
ALTER POLICY "Doctors can insert their own certificates" ON public.medical_certificates
  WITH CHECK (
    public.is_doctor()
    AND doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  );

ALTER POLICY "Doctors can view their own certificates" ON public.medical_certificates
  USING (
    public.is_doctor()
    AND doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  );

ALTER POLICY "Doctors can update their draft certificates" ON public.medical_certificates
  USING (
    public.is_doctor()
    AND doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  )
  WITH CHECK (
    status = 'draft'::text
    AND public.is_doctor()
    AND doctor_id IN (
      SELECT d.id FROM public.doctors d WHERE d.user_id = auth.uid()
    )
  );


-- Reproductive-health chats and messages also contain patient information.
-- Their original specialist grants relied solely on a doctor-id relationship.
-- Keep independent access for the patient, while requiring the same approved
-- doctor predicate for the specialist side of the authorization.

ALTER POLICY "Users can view their own chats" ON public.medical_chats
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = medical_chats.patient_id
        AND p.user_id = (SELECT auth.uid())
    )
    OR (
      public.is_doctor()
      AND EXISTS (
        SELECT 1
        FROM public.reproductive_health_specialists rhs
        JOIN public.doctors d ON d.id = rhs.doctor_id
        WHERE rhs.id = medical_chats.specialist_id
          AND d.user_id = (SELECT auth.uid())
      )
    )
  );

ALTER POLICY "Users can view messages from their chats" ON public.medical_messages
  USING (
    EXISTS (
      SELECT 1
      FROM public.medical_chats c
      JOIN public.patients p ON p.id = c.patient_id
      WHERE c.id = medical_messages.chat_id
        AND p.user_id = (SELECT auth.uid())
    )
    OR (
      public.is_doctor()
      AND EXISTS (
        SELECT 1
        FROM public.medical_chats c
        JOIN public.reproductive_health_specialists rhs ON rhs.id = c.specialist_id
        JOIN public.doctors d ON d.id = rhs.doctor_id
        WHERE c.id = medical_messages.chat_id
          AND d.user_id = (SELECT auth.uid())
      )
    )
  );

ALTER POLICY "Users can insert messages in their chats" ON public.medical_messages
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.medical_chats c
      JOIN public.patients p ON p.id = c.patient_id
      WHERE c.id = medical_messages.chat_id
        AND p.user_id = (SELECT auth.uid())
    )
    OR (
      public.is_doctor()
      AND EXISTS (
        SELECT 1
        FROM public.medical_chats c
        JOIN public.reproductive_health_specialists rhs ON rhs.id = c.specialist_id
        JOIN public.doctors d ON d.id = rhs.doctor_id
        WHERE c.id = medical_messages.chat_id
          AND d.user_id = (SELECT auth.uid())
      )
    )
  );
