-- Staging only: replace PUBLIC role on identity-bound policies with the
-- actual authenticated/service role. This preserves their predicates while
-- preventing anonymous GraphQL schema exposure.
ALTER POLICY "owner_can_manage_faq" ON public.ai_user_faq TO authenticated;
ALTER POLICY "owner_can_manage_patterns" ON public.ai_user_patterns TO authenticated;
ALTER POLICY "patient_insert_anamnesis" ON public.anamnesis TO authenticated;
ALTER POLICY "patient_select_anamnesis" ON public.anamnesis TO authenticated;
ALTER POLICY "patient_update_anamnesis" ON public.anamnesis TO authenticated;
ALTER POLICY "Patients read own extractions" ON public.anamnesis_extractions TO authenticated;
ALTER POLICY "anamnesis_versions_patient_select" ON public.anamnesis_versions TO authenticated;
ALTER POLICY "history_select_participants" ON public.appointment_history TO authenticated;
ALTER POLICY "Users can view and edit own preconsultations" ON public.appointment_preconsultations TO authenticated;
ALTER POLICY "reminders_select_participants" ON public.appointment_reminders TO authenticated;
ALTER POLICY "waitlist_insert_patient" ON public.appointment_waitlist TO authenticated;
ALTER POLICY "waitlist_select_own" ON public.appointment_waitlist TO authenticated;
ALTER POLICY "waitlist_update_own" ON public.appointment_waitlist TO authenticated;
ALTER POLICY "appointments_delete_participants" ON public.appointments TO authenticated;
ALTER POLICY "appointments_insert_authorized" ON public.appointments TO authenticated;
ALTER POLICY "appointments_select_participants" ON public.appointments TO authenticated;
ALTER POLICY "appointments_update_participants" ON public.appointments TO authenticated;
ALTER POLICY "audit_logs_select_admin" ON public.audit_logs TO authenticated;
ALTER POLICY "catalog_service_all" ON public.benefit_catalog_items TO service_role;
ALTER POLICY "vouchers_select_own" ON public.benefit_vouchers TO authenticated;
ALTER POLICY "vouchers_service_all" ON public.benefit_vouchers TO service_role;
ALTER POLICY "call_events_for_participants" ON public.call_events TO authenticated;
ALTER POLICY "calls_participants_all" ON public.calls TO authenticated;
ALTER POLICY "doctors_view_patient_clinical_states" ON public.clinical_case_states TO authenticated;
ALTER POLICY "patients_update_own_clinical_states" ON public.clinical_case_states TO authenticated;
ALTER POLICY "patients_upsert_own_clinical_states" ON public.clinical_case_states TO authenticated;
ALTER POLICY "patients_view_own_clinical_states" ON public.clinical_case_states TO authenticated;
ALTER POLICY "service_role_full_access_clinical_states" ON public.clinical_case_states TO service_role;
ALTER POLICY "companies_delete_admin" ON public.companies TO authenticated;
ALTER POLICY "companies_insert_admin" ON public.companies TO authenticated;
ALTER POLICY "companies_update_owner" ON public.companies TO authenticated;
ALTER POLICY "Patients can insert chat messages" ON public.conversation_events TO authenticated;
ALTER POLICY "Service role can insert conversation events" ON public.conversation_events TO service_role;
ALTER POLICY "Doctors can insert assigned chat sessions" ON public.conversation_sessions TO authenticated;
ALTER POLICY "Doctors can view their own conversation sessions" ON public.conversation_sessions TO authenticated;
ALTER POLICY "Patients can insert their own conversation sessions" ON public.conversation_sessions TO authenticated;
ALTER POLICY "Patients can update their own conversation sessions" ON public.conversation_sessions TO authenticated;
ALTER POLICY "Patients can view their own conversation sessions" ON public.conversation_sessions TO authenticated;
ALTER POLICY "availability_delete_own" ON public.doctor_availability TO authenticated;
ALTER POLICY "availability_insert_own" ON public.doctor_availability TO authenticated;
ALTER POLICY "availability_update_own" ON public.doctor_availability TO authenticated;
ALTER POLICY "overrides_delete_own" ON public.doctor_availability_overrides TO authenticated;
ALTER POLICY "overrides_insert_own" ON public.doctor_availability_overrides TO authenticated;
ALTER POLICY "overrides_update_own" ON public.doctor_availability_overrides TO authenticated;
ALTER POLICY "doctor_duty_status_modify_own" ON public.doctor_duty_status TO authenticated, service_role;
ALTER POLICY "doctor_duty_status_select_safe" ON public.doctor_duty_status TO authenticated, service_role;
ALTER POLICY "Users can view own licenses" ON public.doctor_licenses TO authenticated;
ALTER POLICY "doctor_patient_delete_scoped" ON public.doctor_patient TO authenticated;
ALTER POLICY "doctor_patient_insert_scoped" ON public.doctor_patient TO authenticated;
ALTER POLICY "doctor_patient_select_scoped" ON public.doctor_patient TO authenticated;
ALTER POLICY "doctor_prescription_templates_delete_own" ON public.doctor_prescription_templates TO authenticated;
ALTER POLICY "doctor_prescription_templates_insert_own" ON public.doctor_prescription_templates TO authenticated;
ALTER POLICY "doctor_prescription_templates_select_own" ON public.doctor_prescription_templates TO authenticated;
ALTER POLICY "doctor_prescription_templates_update_own" ON public.doctor_prescription_templates TO authenticated;
ALTER POLICY "doctor_scheduling_config_insert_own" ON public.doctor_scheduling_config TO authenticated;
ALTER POLICY "doctor_scheduling_config_select_own" ON public.doctor_scheduling_config TO authenticated;
ALTER POLICY "doctor_scheduling_config_update_own" ON public.doctor_scheduling_config TO authenticated;
ALTER POLICY "Users can view own specialties" ON public.doctor_specialties TO authenticated;
ALTER POLICY "subscriptions_doctor_read_own" ON public.doctor_subscriptions TO authenticated;
ALTER POLICY "subscriptions_service_all" ON public.doctor_subscriptions TO service_role;
ALTER POLICY "doctors_delete_admin" ON public.doctors TO authenticated;
ALTER POLICY "doctors_insert_own" ON public.doctors TO authenticated;
ALTER POLICY "doctors_update_own" ON public.doctors TO authenticated;
ALTER POLICY "doctors_insert_lab_results" ON public.lab_results TO authenticated;
ALTER POLICY "Doctors can view their own certificates" ON public.medical_certificates TO authenticated;
ALTER POLICY "Doctors can insert their own medical orders" ON public.medical_orders TO authenticated;
ALTER POLICY "Doctors can update their own draft medical orders" ON public.medical_orders TO authenticated;
ALTER POLICY "Doctors can view their own medical orders" ON public.medical_orders TO authenticated;
ALTER POLICY "Patients can view their own medical orders" ON public.medical_orders TO authenticated;
ALTER POLICY "medical_record_authorizations_select_policy" ON public.medical_record_authorizations TO authenticated;
ALTER POLICY "medical_records_delete_admin" ON public.medical_records TO authenticated;
ALTER POLICY "medical_records_update_authorized" ON public.medical_records TO authenticated;
ALTER POLICY "patients_insert_own_medication_logs" ON public.medication_logs TO authenticated;
ALTER POLICY "settlements_partner_select" ON public.partner_settlements TO authenticated;
ALTER POLICY "settlements_service_all" ON public.partner_settlements TO service_role;
ALTER POLICY "owner_can_insert_chats" ON public.patient_ai_chats TO authenticated;
ALTER POLICY "owner_can_read_chats" ON public.patient_ai_chats TO authenticated;
ALTER POLICY "patient_care_team_delete_scoped" ON public.patient_care_team TO authenticated;
ALTER POLICY "patient_care_team_insert_scoped" ON public.patient_care_team TO authenticated;
ALTER POLICY "patient_care_team_select_scoped" ON public.patient_care_team TO authenticated;
ALTER POLICY "patient_care_team_update_scoped" ON public.patient_care_team TO authenticated;
ALTER POLICY "reserve_ledger_select_own" ON public.patient_health_reserve_ledger TO authenticated;
ALTER POLICY "reserve_ledger_service_all" ON public.patient_health_reserve_ledger TO service_role;
ALTER POLICY "patient_reserves_select_own" ON public.patient_health_reserves TO authenticated;
ALTER POLICY "patient_reserves_service_all" ON public.patient_health_reserves TO service_role;
ALTER POLICY "patient_subs_select_own" ON public.patient_subscriptions TO authenticated;
ALTER POLICY "patient_subs_service_all" ON public.patient_subscriptions TO service_role;
ALTER POLICY "patient_wallet_ledger_select_own" ON public.patient_wallet_ledger TO authenticated;
ALTER POLICY "service_role_manage_patient_wallet_ledger" ON public.patient_wallet_ledger TO service_role;
ALTER POLICY "patient_wallets_select_own" ON public.patient_wallets TO authenticated;
ALTER POLICY "service_role_manage_patient_wallets" ON public.patient_wallets TO service_role;
ALTER POLICY "patients_delete_admin" ON public.patients TO authenticated;
ALTER POLICY "patients_insert_own" ON public.patients TO authenticated;
ALTER POLICY "patients_select_scoped" ON public.patients TO authenticated;
ALTER POLICY "patients_update_scoped" ON public.patients TO authenticated;
ALTER POLICY "transactions_doctor_read_own" ON public.payment_transactions TO authenticated;
ALTER POLICY "transactions_service_all" ON public.payment_transactions TO service_role;
ALTER POLICY "pharmacy_dispatch_requests_insert_owner" ON public.pharmacy_dispatch_requests TO authenticated, service_role;
ALTER POLICY "pharmacy_dispatch_requests_select_confined" ON public.pharmacy_dispatch_requests TO authenticated, service_role;
ALTER POLICY "pharmacy_dispatch_requests_update_assigned_or_owner" ON public.pharmacy_dispatch_requests TO authenticated, service_role;
ALTER POLICY "Users can insert audit events of their own prescriptions" ON public.prescription_audit_events TO authenticated;
ALTER POLICY "Users can view audit events of their own prescriptions" ON public.prescription_audit_events TO authenticated;
ALTER POLICY "Doctors can insert their own prescriptions" ON public.prescriptions TO authenticated;
ALTER POLICY "Doctors can update their own draft prescriptions" ON public.prescriptions TO authenticated;
ALTER POLICY "Doctors can view their own prescriptions" ON public.prescriptions TO authenticated;
ALTER POLICY "Patients can view their own prescriptions" ON public.prescriptions TO authenticated;
ALTER POLICY "profiles_delete_admin" ON public.profiles TO authenticated;
ALTER POLICY "profiles_insert_self" ON public.profiles TO authenticated;
ALTER POLICY "profiles_select_self_or_admin" ON public.profiles TO authenticated;
ALTER POLICY "profiles_update_self" ON public.profiles TO authenticated;
ALTER POLICY "patients_insert_own_symptoms" ON public.symptom_reports TO authenticated;
ALTER POLICY "Users can insert own participation" ON public.telemedicine_room_participants TO authenticated;
ALTER POLICY "Users can update own participation" ON public.telemedicine_room_participants TO authenticated;
ALTER POLICY "Users can view own participation" ON public.telemedicine_room_participants TO authenticated;
ALTER POLICY "telemedicine_sessions_insert_participants" ON public.telemedicine_sessions TO authenticated;
ALTER POLICY "telemedicine_sessions_select_participants" ON public.telemedicine_sessions TO authenticated;
ALTER POLICY "telemedicine_sessions_update_participants" ON public.telemedicine_sessions TO authenticated;
ALTER POLICY "patients_insert_own_vitals" ON public.vital_signs TO authenticated;

 
-- Remove SELECT grants for roles that have no matching SELECT policy after role scoping.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND has_table_privilege('anon',c.oid,'SELECT')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname='public' AND p.tablename=c.relname
          AND p.cmd IN ('SELECT','ALL')
          AND ('anon'=ANY(p.roles) OR 'public'=ANY(p.roles))
      )
  LOOP EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM anon',r.relname); END LOOP;

  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
      AND has_table_privilege('authenticated',c.oid,'SELECT')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname='public' AND p.tablename=c.relname
          AND p.cmd IN ('SELECT','ALL')
          AND ('authenticated'=ANY(p.roles) OR 'public'=ANY(p.roles))
      )
  LOOP EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM authenticated',r.relname); END LOOP;
END $$;

