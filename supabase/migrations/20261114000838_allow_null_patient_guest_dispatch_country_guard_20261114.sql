CREATE OR REPLACE FUNCTION app_private.guard_dispatch_care_country()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_country text; v_doctor uuid;
BEGIN
  IF TG_TABLE_NAME='dispatch_offers' THEN
    IF TG_OP='UPDATE' AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
       AND NEW.dispatch_request_id IS NOT DISTINCT FROM OLD.dispatch_request_id
       AND NEW.status <> 'accepted' THEN RETURN NEW; END IF;
    SELECT r.care_country INTO v_country
    FROM public.pharmacy_dispatch_requests r
    WHERE r.id=NEW.dispatch_request_id
      AND r.care_country IS NOT NULL
      AND (
        r.patient_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.patients p
          WHERE p.id=r.patient_id AND p.active IS TRUE AND p.care_country=r.care_country
        )
      );
    v_doctor := NEW.doctor_id;
  ELSIF TG_TABLE_NAME='pharmacy_dispatch_requests' THEN
    IF TG_OP='UPDATE' AND NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
       AND NEW.assigned_doctor_id IS NOT DISTINCT FROM OLD.assigned_doctor_id
       AND NEW.care_country IS NOT DISTINCT FROM OLD.care_country
       AND (NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status IN ('completed','cancelled','expired'))
    THEN RETURN NEW; END IF;
    IF NEW.patient_id IS NULL THEN
      v_country := NEW.care_country;
    ELSE
      SELECT care_country INTO v_country FROM public.patients WHERE id=NEW.patient_id AND active IS TRUE;
      IF v_country IS DISTINCT FROM NEW.care_country THEN
        RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
      END IF;
    END IF;
    v_doctor := NEW.assigned_doctor_id;
  ELSE
    -- Legacy requests have no patient FK: reject unknown country and mixed assignments.
    IF TG_OP='UPDATE' AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
      AND NEW.care_country IS NOT DISTINCT FROM OLD.care_country
      AND (NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status IN ('completed','cancelled','expired'))
    THEN RETURN NEW; END IF;
    v_country := NEW.care_country; v_doctor := NEW.doctor_id;
  END IF;
  IF v_country IS NULL THEN
    RAISE EXCEPTION 'care_country_required' USING ERRCODE='42501';
  END IF;
  IF v_doctor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.doctors
    WHERE id=v_doctor AND active IS TRUE AND care_country=v_country) THEN
    RAISE EXCEPTION 'care_country_dispatch_mismatch' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
