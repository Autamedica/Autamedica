-- Keep legacy pharmacy request visibility inside the doctor's care country.
-- Older staging schema has no care_country column; production does.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pharmacy_consultation_requests'
      AND column_name='care_country'
  ) THEN
    DROP POLICY IF EXISTS "pharmacy_consultation_requests_select_confined"
      ON public.pharmacy_consultation_requests;
    CREATE POLICY "pharmacy_consultation_requests_select_confined"
      ON public.pharmacy_consultation_requests
      FOR SELECT TO authenticated,service_role
      USING (
        auth.role()='service_role'
        OR (
          doctor_id=auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.user_id=auth.uid()
              AND d.care_country=pharmacy_consultation_requests.care_country
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.doctors d
          WHERE d.id=pharmacy_consultation_requests.doctor_id
            AND d.user_id=auth.uid()
            AND d.care_country=pharmacy_consultation_requests.care_country
        )
        OR (
          status='pending'
          AND EXISTS (
            SELECT 1
            FROM public.doctor_duty_status dds
            JOIN public.doctors d ON d.id=dds.doctor_id
            WHERE (dds.doctor_id=auth.uid() OR d.user_id=auth.uid())
              AND d.active IS TRUE
              AND d.care_country=pharmacy_consultation_requests.care_country
              AND dds.is_on_duty IS TRUE
              AND dds.last_heartbeat_at > (pg_catalog.now()-INTERVAL '90 seconds')
          )
        )
      );

    DROP POLICY IF EXISTS "pharmacy_consultation_requests_update_confined"
      ON public.pharmacy_consultation_requests;
    CREATE POLICY "pharmacy_consultation_requests_update_confined"
      ON public.pharmacy_consultation_requests
      FOR UPDATE TO authenticated,service_role
      USING (
        auth.role()='service_role'
        OR (
          doctor_id=auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.user_id=auth.uid()
              AND d.care_country=pharmacy_consultation_requests.care_country
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.doctors d
          WHERE d.id=pharmacy_consultation_requests.doctor_id
            AND d.user_id=auth.uid()
            AND d.care_country=pharmacy_consultation_requests.care_country
        )
        OR (
          status='pending'
          AND EXISTS (
            SELECT 1
            FROM public.doctor_duty_status dds
            JOIN public.doctors d ON d.id=dds.doctor_id
            WHERE (dds.doctor_id=auth.uid() OR d.user_id=auth.uid())
              AND d.active IS TRUE
              AND d.care_country=pharmacy_consultation_requests.care_country
              AND dds.is_on_duty IS TRUE
              AND dds.last_heartbeat_at > (pg_catalog.now()-INTERVAL '90 seconds')
          )
        )
      )
      WITH CHECK (
        auth.role()='service_role'
        OR (
          doctor_id=auth.uid()
          AND EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.user_id=auth.uid()
              AND d.care_country=pharmacy_consultation_requests.care_country
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.doctors d
          WHERE d.id=pharmacy_consultation_requests.doctor_id
            AND d.user_id=auth.uid()
            AND d.care_country=pharmacy_consultation_requests.care_country
        )
      );
  END IF;
END $$;
