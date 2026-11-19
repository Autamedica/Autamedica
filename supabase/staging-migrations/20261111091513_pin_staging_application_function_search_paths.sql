-- Every application-owned reference in these trigger/helper bodies is schema-qualified.
-- Pinning an empty search_path removes caller-controlled object resolution.
ALTER FUNCTION growth_os.is_channel_enabled(text) SET search_path = '';
ALTER FUNCTION growth_os.normalize_notification_contact(text,text) SET search_path = '';
ALTER FUNCTION growth_os.normalize_suppressed_notification_contact() SET search_path = '';
ALTER FUNCTION growth_os.touch_ad_spend_updated_at() SET search_path = '';
ALTER FUNCTION growth_os.touch_doctor_whatsapp_jobs_updated_at() SET search_path = '';
ALTER FUNCTION growth_os.touch_email_jobs_updated_at() SET search_path = '';
ALTER FUNCTION growth_os.touch_leads_updated_at() SET search_path = '';
ALTER FUNCTION growth_os.touch_newsletter_editions_updated_at() SET search_path = '';

ALTER FUNCTION public.enforce_bridge_immutability() SET search_path = '';
ALTER FUNCTION public.enforce_doctor_prescription_template_limit() SET search_path = '';
ALTER FUNCTION public.enforce_extraordinary_dose_review() SET search_path = '';
ALTER FUNCTION public.enforce_substitution_controls() SET search_path = '';
ALTER FUNCTION public.handle_updated_at() SET search_path = '';
ALTER FUNCTION public.prevent_modification_on_audit_log() SET search_path = '';
ALTER FUNCTION public.prevent_safety_audit_mutation() SET search_path = '';
ALTER FUNCTION public.set_clinical_case_state_updated_at() SET search_path = '';
ALTER FUNCTION public.touch_clinical_ai_updated_at() SET search_path = '';
ALTER FUNCTION public.touch_doctor_prescription_template_updated_at() SET search_path = '';
ALTER FUNCTION public.touch_patient_wallets_updated_at() SET search_path = '';
ALTER FUNCTION public.update_wifi_leads_updated_at() SET search_path = '';
