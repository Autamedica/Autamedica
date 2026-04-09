DROP POLICY IF EXISTS "Users can insert audit events of their own prescriptions" ON public.prescription_audit_events;

CREATE POLICY "Users can insert audit events of their own prescriptions"
  ON public.prescription_audit_events FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.prescriptions p
      WHERE p.id = prescription_id
        AND (
          p.doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid())
          OR p.patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
        )
    )
  );
