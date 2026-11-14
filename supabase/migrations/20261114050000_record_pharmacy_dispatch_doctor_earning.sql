-- Create one idempotent BRL doctor earning when a pharmacy dispatch consultation completes.
-- appointment references are nullable for dispatch-originated consultations.
BEGIN;

ALTER TABLE public.doctor_earnings
  ADD COLUMN IF NOT EXISTS dispatch_request_id uuid
    REFERENCES public.pharmacy_dispatch_requests(id) ON DELETE CASCADE;

ALTER TABLE public.doctor_earnings
  ALTER COLUMN appointment_id DROP NOT NULL,
  ALTER COLUMN appointment_payment_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS doctor_earnings_dispatch_request_id_key
  ON public.doctor_earnings(dispatch_request_id)
  WHERE dispatch_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app_private.record_pharmacy_dispatch_doctor_earning()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fee_minor integer;
BEGIN
  IF NEW.status::text <> 'completed'
     OR OLD.status::text = 'completed'
     OR NEW.assigned_doctor_id IS NULL
     OR NEW.doctor_fee_brl IS NULL
     OR NEW.doctor_fee_brl <= 0 THEN
    RETURN NEW;
  END IF;

  v_fee_minor := round(NEW.doctor_fee_brl * 100)::integer;
  IF v_fee_minor <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.doctor_earnings (
    doctor_id, appointment_id, appointment_payment_id, dispatch_request_id,
    gross_amount, platform_fee_amount, processor_fee_amount, net_amount,
    currency, status, metadata, created_at, updated_at
  ) VALUES (
    NEW.assigned_doctor_id, NULL, NULL, NEW.id,
    v_fee_minor, 0, 0, v_fee_minor, 'BRL', 'pending',
    jsonb_build_object('source','pharmacy_dispatch','dispatch_request_id',NEW.id,'doctor_fee_brl',NEW.doctor_fee_brl),
    now(), now()
  )
  ON CONFLICT (dispatch_request_id) WHERE dispatch_request_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_pharmacy_dispatch_doctor_earning ON public.pharmacy_dispatch_requests;
CREATE TRIGGER trg_record_pharmacy_dispatch_doctor_earning
AFTER UPDATE OF status ON public.pharmacy_dispatch_requests
FOR EACH ROW
WHEN (NEW.status::text = 'completed' AND OLD.status::text IS DISTINCT FROM NEW.status::text)
EXECUTE FUNCTION app_private.record_pharmacy_dispatch_doctor_earning();

REVOKE ALL ON FUNCTION app_private.record_pharmacy_dispatch_doctor_earning() FROM PUBLIC, anon, authenticated;
COMMIT;
