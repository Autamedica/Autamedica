-- P0 pharmacy AR/BR contract checks.
-- Run only on a disposable database after the country-isolation migration.
BEGIN;
DO $$ BEGIN
  IF current_setting('autamedica.isolated_test', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'pharmacy_country_isolation: isolated_test must be on';
  END IF;
END $$;

DO $checks$
DECLARE
  v_table text;
  v_trigger text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pharmacies','pharmacists','dispensation_orders'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_table
        AND column_name='care_country' AND is_nullable='NO'
    ) THEN RAISE EXCEPTION 'Missing mandatory care_country on %',v_table; END IF;
  END LOOP;

  FOREACH v_trigger IN ARRAY ARRAY[
    'zz_pharmacy_country','zz_pharmacist_country','zz_dispensation_country',
    'zz_dispensation_validations_country','zz_dispensation_events_country',
    'zz_prescription_dispensation_country_lock'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname=v_trigger AND tgenabled='O'
    ) THEN RAISE EXCEPTION 'Country guard missing or disabled: %',v_trigger; END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dispensation_orders'
      AND column_name='prescriber_verified' AND column_default ~* 'false'
  ) THEN RAISE EXCEPTION 'Prescriber verification defaults to trusted'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.dispensation_orders o
    JOIN public.prescriptions rx ON rx.id=o.prescription_id
    JOIN public.doctors d ON d.id=o.doctor_id
    JOIN public.patients pa ON pa.id=o.patient_id
    LEFT JOIN public.pharmacies ph ON ph.id=o.pharmacy_id
    WHERE o.care_country IS DISTINCT FROM rx.country_code
       OR o.care_country IS DISTINCT FROM d.care_country
       OR o.care_country IS DISTINCT FROM pa.care_country
       OR (o.pharmacy_id IS NOT NULL AND o.care_country IS DISTINCT FROM ph.care_country)
       OR o.patient_id IS DISTINCT FROM rx.patient_id
       OR o.doctor_id IS DISTINCT FROM rx.doctor_id
  ) THEN RAISE EXCEPTION 'Cross-country dispensation order detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.pharmacists ph JOIN public.pharmacies f ON f.id=ph.pharmacy_id
    WHERE ph.care_country IS DISTINCT FROM f.care_country
  ) THEN RAISE EXCEPTION 'Cross-country pharmacist registration detected'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='dispensation_orders'
      AND policyname='dispensation_orders_select_pharmacist'
      AND qual LIKE '%care_country%'
  ) THEN RAISE EXCEPTION 'Unassigned queue is not country scoped'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='dispensation_orders'
      AND policyname='dispensation_orders_update_pharmacist'
      AND with_check LIKE '%care_country%'
  ) THEN RAISE EXCEPTION 'Pharmacist order claims not country scoped'; END IF;
END $checks$;

-- Behavioral test: a non-AR/BR pharmacy cannot be inserted, despite a valid license string.
DO $negative_country$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.pharmacies(name,license_number,care_country)
      VALUES ('CI invalid jurisdiction', 'CI-PHARM-INVALID-'||gen_random_uuid(), 'CL');
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Pharmacy accepted a country outside AR/BR';
  END IF;
END $negative_country$;

-- Successful AR/BR pharmacy registration and negative country reassignment.
DO $immutable$
DECLARE v_id uuid; v_rejected boolean := false;
BEGIN
  INSERT INTO public.pharmacies(name,license_number,care_country)
    VALUES ('CI pharmacy AR', 'CI-PHARM-AR-'||gen_random_uuid(), 'AR')
    RETURNING id INTO v_id;
  IF (SELECT care_country FROM public.pharmacies WHERE id=v_id) <> 'AR' THEN
    RAISE EXCEPTION 'Pharmacy country was not stored';
  END IF;
  BEGIN
    UPDATE public.pharmacies SET care_country='BR' WHERE id=v_id;
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Pharmacy country changed after registration'; END IF;
END $immutable$;

-- Invalid prescribing identity fails before a foreign key could make an order.
DO $invalid_prescription$
DECLARE v_rejected boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.dispensation_orders(
      prescription_id,doctor_id,patient_id,medication,formulation,
      quantity_units,duration_days,dispense_window_start,dispense_window_end
    ) VALUES (
      gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
      'Synthetic medicine','tablet',1,30,current_date,current_date+30
    );
  EXCEPTION WHEN check_violation THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'Dispensation order accepted without a country-validated Rx';
  END IF;
END $invalid_prescription$;

ROLLBACK;
