-- Harden legacy functions only when present; production and clean migration replay
-- have different optional RPC inventories. No functions are created here.
DO $guard$
DECLARE
  fn regprocedure;
  signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'growth_os.normalize_notification_contact(text,text)',
    'growth_os.normalize_suppressed_notification_contact()',
    'growth_os.touch_ad_spend_updated_at()',
    'growth_os.touch_agent_capabilities_updated_at()',
    'growth_os.touch_agent_jobs_updated_at()',
    'growth_os.touch_crm_updated_at()',
    'growth_os.touch_doctor_whatsapp_jobs_updated_at()',
    'growth_os.touch_email_jobs_updated_at()',
    'growth_os.touch_leads_updated_at()',
    'growth_os.touch_newsletter_editions_updated_at()',
    'growth_os.touch_patient_activation_updated_at()',
    'public.handle_sync_user_avatar()',
    'public.prevent_safety_audit_mutation()',
    'public.set_preanamnesis_review_updated_at()',
    'public.touch_clinical_ai_updated_at()',
    'public.touch_doctor_prescription_template_updated_at()',
    'public.update_triage_updated_at()',
    'public.update_wifi_leads_updated_at()'
  ] LOOP
    fn := to_regprocedure(signature);
    IF fn IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog', fn);
    END IF;
  END LOOP;
END
$guard$;
