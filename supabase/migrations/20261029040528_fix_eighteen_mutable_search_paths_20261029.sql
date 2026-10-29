-- Harden trigger utilities and notification helpers with fixed catalog search path.
-- Mirrored from already applied AutaMedica production migration on 2026-10-29.
ALTER FUNCTION growth_os.normalize_notification_contact(text,text) SET search_path = pg_catalog;
ALTER FUNCTION growth_os.normalize_suppressed_notification_contact() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_ad_spend_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_agent_capabilities_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_agent_jobs_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_crm_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_doctor_whatsapp_jobs_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_email_jobs_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_leads_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_newsletter_editions_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION growth_os.touch_patient_activation_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.handle_sync_user_avatar() SET search_path = pg_catalog;
ALTER FUNCTION public.prevent_safety_audit_mutation() SET search_path = pg_catalog;
ALTER FUNCTION public.set_preanamnesis_review_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.touch_clinical_ai_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.touch_doctor_prescription_template_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.update_triage_updated_at() SET search_path = pg_catalog;
ALTER FUNCTION public.update_wifi_leads_updated_at() SET search_path = pg_catalog;
