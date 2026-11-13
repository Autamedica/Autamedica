-- Contain direct PostgREST UPDATE against clinical dispatch records.
-- Previously a request owner could modify assignment, payment and call fields.
-- Internal SECURITY DEFINER dispatch engines and service_role jobs retain their
-- existing execution path. Signed-in doctors may update only safe call state.
CREATE OR REPLACE FUNCTION public.guard_pharmacy_dispatch_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $guard$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Trusted database/Edge service operations: used by the dispatcher and cron.
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF public.is_system_admin() THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.doctors d
       WHERE d.id = OLD.assigned_doctor_id
         AND d.user_id = v_uid
         AND d.active IS TRUE
         AND NULLIF(btrim(d.license_number), '') IS NOT NULL
         AND upper(btrim(d.license_number)) !~ '^PENDING'
     )
  THEN
    RAISE EXCEPTION 'dispatch_update_access_denied' USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['status','call_started_at','call_ended_at','updated_at'])
    IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','call_started_at','call_ended_at','updated_at'])
  THEN
    RAISE EXCEPTION 'dispatch_protected_fields_immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
       (OLD.status = 'matched' AND NEW.status IN ('in_call', 'completed'))
       OR (OLD.status = 'in_call' AND NEW.status = 'completed')
    ) THEN
      RAISE EXCEPTION 'dispatch_invalid_status_transition' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$guard$;

DROP TRIGGER IF EXISTS trg_guard_pharmacy_dispatch_update
  ON public.pharmacy_dispatch_requests;
CREATE TRIGGER trg_guard_pharmacy_dispatch_update
  BEFORE UPDATE ON public.pharmacy_dispatch_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_pharmacy_dispatch_update();
