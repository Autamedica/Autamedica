-- Cache only statement-constant identity/role checks; preserve row-correlated authorization.
ALTER POLICY "doctors_view_patient_clinical_states" ON public."clinical_case_states" TO authenticated USING ((EXISTS ( SELECT 1
   FROM appointments a
  WHERE ((a.patient_id = clinical_case_states.patient_id) AND (a.doctor_id IN ( SELECT d.id
           FROM doctors d
          WHERE (d.user_id = (SELECT auth.uid()))))))));
ALTER POLICY "patients_update_own_clinical_states" ON public."clinical_case_states" TO authenticated USING ((patient_id IN ( SELECT patients.id
   FROM patients
  WHERE (patients.user_id = (SELECT auth.uid())))));
ALTER POLICY "patients_upsert_own_clinical_states" ON public."clinical_case_states" TO authenticated WITH CHECK ((patient_id IN ( SELECT patients.id
   FROM patients
  WHERE (patients.user_id = (SELECT auth.uid())))));
ALTER POLICY "patients_view_own_clinical_states" ON public."clinical_case_states" TO authenticated USING ((patient_id IN ( SELECT patients.id
   FROM patients
  WHERE (patients.user_id = (SELECT auth.uid())))));
ALTER POLICY "service_role_full_access_clinical_states" ON public."clinical_case_states" TO service_role USING (true) WITH CHECK (true);
ALTER POLICY "medical_records_delete_admin" ON public."medical_records" USING ((SELECT public.is_system_admin()));
ALTER POLICY "medical_records_insert_doctor" ON public."medical_records" WITH CHECK (((deleted_at IS NULL) AND (((SELECT public.is_doctor()) AND (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = medical_records.patient_id) AND doctor_has_patient_access(p.user_id))))) OR (SELECT public.is_system_admin()))));
ALTER POLICY "medical_records_select_scoped" ON public."medical_records" USING (((deleted_at IS NULL) AND ((EXISTS ( SELECT 1
   FROM doctors d
  WHERE ((d.id = medical_records.doctor_id) AND (d.user_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (patient_care_team pct
     JOIN doctors d ON ((d.id = pct.doctor_id)))
  WHERE ((pct.patient_id = medical_records.patient_id) AND (d.user_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = medical_records.patient_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM patients p
  WHERE ((p.id = medical_records.patient_id) AND doctor_has_patient_access(p.user_id)))) OR (SELECT public.is_system_admin()))));
ALTER POLICY "medical_records_soft_delete" ON public."medical_records" USING (((deleted_at IS NULL) AND ((EXISTS ( SELECT 1
   FROM doctors d
  WHERE ((d.id = medical_records.doctor_id) AND (d.user_id = ( SELECT auth.uid() AS uid))))) OR (SELECT public.is_system_admin())))) WITH CHECK ((deleted_at IS NOT NULL));
ALTER POLICY "medical_records_update_authorized" ON public."medical_records" USING (((EXISTS ( SELECT 1
   FROM doctors d
  WHERE ((d.id = medical_records.doctor_id) AND (d.user_id = ( SELECT auth.uid() AS uid)) AND (SELECT public.is_doctor())))) OR (SELECT public.is_system_admin())));
ALTER POLICY "Doctors global patient search" ON public."profiles" USING (((((SELECT auth.jwt()) ->> 'role'::text) = 'doctor'::text) OR ((SELECT auth.uid()) = user_id)));
ALTER POLICY "profiles_delete_admin" ON public."profiles" USING ((SELECT public.is_platform_or_org_admin((SELECT auth.uid()))));
ALTER POLICY "profiles_select_self_or_admin" ON public."profiles" USING (((user_id = ( SELECT auth.uid() AS uid)) OR (SELECT public.is_platform_or_org_admin((SELECT auth.uid())))));
