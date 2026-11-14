BEGIN;

ALTER TABLE public.platform_operational_switches
  ADD COLUMN IF NOT EXISTS dispatch_engine_enabled boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS admin_approval_expired_dispatch_request_key
  ON public.admin_approval_decisions ((payload->>'dispatch_request_id'))
  WHERE payload->>'action_type' = 'expired_paid_dispatch';

CREATE OR REPLACE FUNCTION public.expire_stale_dispatch_requests()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  r public.pharmacy_dispatch_requests%ROWTYPE;
  p public.pharmacy_dispatch_payments%ROWTYPE;
  v_expired_count integer := 0;
  v_approval_count integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.pharmacy_dispatch_requests
    WHERE status = 'searching' AND search_timeout_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.pharmacy_dispatch_requests SET status = 'expired', updated_at = now()
    WHERE id = r.id AND status = 'searching';
    IF NOT FOUND THEN CONTINUE; END IF;
    v_expired_count := v_expired_count + 1;
    SELECT * INTO p FROM public.pharmacy_dispatch_payments
    WHERE dispatch_request_id = r.id AND status = 'approved'
    ORDER BY paid_at DESC NULLS LAST, created_at DESC LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.admin_approval_decisions
        (domain,status,proposed_by,summary,risk_reason,impact_scope,payload)
      VALUES
        ('money','PENDING_HUMAN_APPROVAL','system',
         'Consulta QR pagada expiró sin médico asignado',
         'Pago aprobado sin asignación médica antes del vencimiento',
         'Despacho farmacéutico; reapertura de búsqueda o reembolso del pago',
         jsonb_build_object('action_type','expired_paid_dispatch',
           'dispatch_request_id',r.id,'payment_id',p.id,
           'mp_payment_id',p.provider_payment_id,'amount',p.amount_minor / 100.0))
      ON CONFLICT ((payload->>'dispatch_request_id'))
        WHERE payload->>'action_type' = 'expired_paid_dispatch' DO NOTHING;
      IF FOUND THEN v_approval_count := v_approval_count + 1; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('expired_count',v_expired_count,
    'approval_count',v_approval_count,'executed_at',now());
END;
$function$;

CREATE OR REPLACE FUNCTION app_private.record_pharmacy_dispatch_doctor_earning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_fee_minor integer;
  v_payment public.pharmacy_dispatch_payments%ROWTYPE;
  v_partner_active boolean;
BEGIN
  IF NEW.status::text <> 'completed' OR OLD.status::text = 'completed'
     OR NEW.assigned_doctor_id IS NULL OR NEW.doctor_fee_brl IS NULL
     OR NEW.doctor_fee_brl <= 0 THEN RETURN NEW; END IF;
  v_fee_minor := round(NEW.doctor_fee_brl * 100)::integer;
  IF v_fee_minor <= 0 THEN RETURN NEW; END IF;
  INSERT INTO public.doctor_earnings (
    doctor_id,appointment_id,appointment_payment_id,dispatch_request_id,
    gross_amount,platform_fee_amount,processor_fee_amount,net_amount,
    currency,status,metadata,created_at,updated_at
  ) VALUES (NEW.assigned_doctor_id,NULL,NULL,NEW.id,v_fee_minor,0,0,v_fee_minor,
    'BRL','pending',jsonb_build_object('source','pharmacy_dispatch',
    'dispatch_request_id',NEW.id,'doctor_fee_brl',NEW.doctor_fee_brl),now(),now())
  ON CONFLICT (dispatch_request_id) WHERE dispatch_request_id IS NOT NULL DO NOTHING;
  SELECT * INTO v_payment FROM public.pharmacy_dispatch_payments
  WHERE dispatch_request_id=NEW.id AND status='approved'
  ORDER BY paid_at DESC NULLS LAST,created_at DESC LIMIT 1;
  IF NEW.referral_partner_id IS NOT NULL AND v_payment.id IS NOT NULL THEN
    SELECT active INTO v_partner_active FROM public.commercial_referral_partners
    WHERE id=NEW.referral_partner_id;
    IF v_partner_active IS TRUE THEN
      INSERT INTO public.commercial_referral_commissions
        (dispatch_request_id,dispatch_payment_id,referral_partner_id,
         amount_minor,currency,status,eligible_at)
      VALUES (NEW.id,v_payment.id,NEW.referral_partner_id,1000,'BRL','eligible',now())
      ON CONFLICT (dispatch_request_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.match_dispatch_doctors(uuid) RENAME TO match_dispatch_doctors_without_switch;
ALTER FUNCTION public.match_dispatch_doctors_without_switch(uuid) SET SCHEMA app_private;

CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $function$
DECLARE v_enabled boolean;
BEGIN
  SELECT dispatch_engine_enabled INTO v_enabled
  FROM public.platform_operational_switches WHERE id='global';
  IF v_enabled IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('success',false,'code','DISPATCH_ENGINE_DISABLED');
  END IF;
  RETURN app_private.match_dispatch_doctors_without_switch(p_dispatch_id);
END;
$function$;

COMMIT;
