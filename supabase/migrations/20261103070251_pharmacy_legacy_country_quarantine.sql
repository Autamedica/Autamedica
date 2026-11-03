-- Compatibility with nonempty pharmacy tables: jurisdiction is deliberately
-- unknown for old rows. No classification or clinical data is inferred/rewritten.
DO $quarantine_rls$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pharmacies','pharmacists','dispensation_orders'] LOOP
    EXECUTE format('CREATE POLICY pharmacy_country_known ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(care_country IN (''AR'',''BR'')) WITH CHECK(care_country IN (''AR'',''BR''))',v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['dispensation_validations','dispensation_events','dispensation_clarifications','pharmacy_audit_events'] LOOP
    EXECUTE format('CREATE POLICY pharmacy_order_country_known ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING(EXISTS(SELECT 1 FROM public.dispensation_orders o WHERE o.id=%I.order_id AND o.care_country IN (''AR'',''BR''))) WITH CHECK(EXISTS(SELECT 1 FROM public.dispensation_orders o WHERE o.id=%I.order_id AND o.care_country IN (''AR'',''BR'')))',v_table,v_table,v_table);
  END LOOP;
END $quarantine_rls$;

-- Retain old source rows even through privileged direct deletes. Reconciliation
-- requires a separately reviewed procedure, never ordinary CRUD or reactivation.
CREATE FUNCTION app_private.guard_legacy_pharmacy_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $$ BEGIN
  IF OLD.care_country IS NULL THEN
    RAISE EXCEPTION 'pharmacy_historical_country_quarantined' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION app_private.guard_legacy_pharmacy_delete() FROM PUBLIC,anon,authenticated,service_role;
DO $retain_legacy$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pharmacies','pharmacists','dispensation_orders'] LOOP
    EXECUTE format('CREATE TRIGGER aa_retain_legacy_pharmacy BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.guard_legacy_pharmacy_delete()',v_table);
  END LOOP;
END $retain_legacy$;

CREATE INDEX IF NOT EXISTS idx_dispensation_orders_country_unassigned
  ON public.dispensation_orders(care_country, status, created_at)
  WHERE pharmacy_id IS NULL AND deleted_at IS NULL AND care_country IS NOT NULL;
