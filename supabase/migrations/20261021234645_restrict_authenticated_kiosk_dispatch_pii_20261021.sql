-- SECURITY P0: production migration applied and verified on 2026-10-21.
-- Tested with synthetic staging records and rollback-only production dry-run.
-- No patient records were modified.
--
-- The previous 'status IN (searching, matched, in_call)' SELECT rule exposed
-- *all* corresponding patient CPF/DNI, phone, name and symptom information
-- to any caller, including anon. UPDATE also allowed unauthenticated writes.
-- The signed guest-token route /api/pharmacy/dispatch/[id] handles kiosk
-- access; public PostgREST access must not substitute for it.
--
-- Keep public kiosk INSERT permission for existing self-service intake API,
-- but explicitly deny unauthenticated SELECT/UPDATE.
REVOKE SELECT, UPDATE ON TABLE public.pharmacy_dispatch_requests
  FROM PUBLIC, anon;

DROP POLICY IF EXISTS "pharmacy_dispatch_requests_select_kiosk_or_confined"
  ON public.pharmacy_dispatch_requests;

CREATE POLICY "pharmacy_dispatch_requests_select_scoped"
  ON public.pharmacy_dispatch_requests
  FOR SELECT TO authenticated
  USING (
    (auth.uid() IS NOT NULL AND requested_by_user_id = auth.uid())
    OR (auth.uid() IS NOT NULL AND assigned_doctor_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = pharmacy_dispatch_requests.assigned_doctor_id
        AND d.user_id = auth.uid()
    )
    OR public.is_system_admin()
    OR (
      status = 'searching'::public.dispatch_request_status
      AND EXISTS (
        SELECT 1
        FROM public.doctors d
        JOIN public.doctor_duty_status ds ON ds.doctor_id = d.id
        WHERE d.user_id = auth.uid()
          AND ds.is_on_duty = true
          AND ds.last_heartbeat_at > now() - interval '90 seconds'
      )
    )
  );

DROP POLICY IF EXISTS "pharmacy_dispatch_requests_update_kiosk_or_assigned"
  ON public.pharmacy_dispatch_requests;

CREATE POLICY "pharmacy_dispatch_requests_update_scoped"
  ON public.pharmacy_dispatch_requests
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() IS NOT NULL AND requested_by_user_id = auth.uid())
    OR (auth.uid() IS NOT NULL AND assigned_doctor_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = pharmacy_dispatch_requests.assigned_doctor_id
        AND d.user_id = auth.uid()
    )
    OR public.is_system_admin()
  )
  WITH CHECK (
    (auth.uid() IS NOT NULL AND requested_by_user_id = auth.uid())
    OR (auth.uid() IS NOT NULL AND assigned_doctor_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = pharmacy_dispatch_requests.assigned_doctor_id
        AND d.user_id = auth.uid()
    )
    OR public.is_system_admin()
  );

-- Only status/lifecycle timestamps should be mutable by an ordinary client.
-- The backend service role retains full privileges.
REVOKE UPDATE ON TABLE public.pharmacy_dispatch_requests
  FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status, call_started_at, call_ended_at)
  ON TABLE public.pharmacy_dispatch_requests TO authenticated;

GRANT SELECT ON TABLE public.pharmacy_dispatch_requests TO authenticated, service_role;
GRANT INSERT ON TABLE public.pharmacy_dispatch_requests TO anon, authenticated, service_role;
