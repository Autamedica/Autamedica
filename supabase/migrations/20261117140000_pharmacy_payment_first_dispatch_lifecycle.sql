-- Payment-first lifecycle for Pharmacy Express. Checkout time is not clinical search time.
ALTER TYPE public.dispatch_request_status ADD VALUE IF NOT EXISTS 'pending_payment';

ALTER TABLE public.pharmacy_dispatch_requests
  ADD COLUMN IF NOT EXISTS payment_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS search_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_activation_result jsonb;

CREATE INDEX IF NOT EXISTS idx_pharmacy_dispatch_pending_payment
  ON public.pharmacy_dispatch_requests (created_at)
  WHERE status = 'pending_payment';

-- The queue timeout applies only after successful settlement has started medical search.
CREATE OR REPLACE FUNCTION public.expire_stale_dispatch_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  r public.pharmacy_dispatch_requests%ROWTYPE;
  p public.pharmacy_dispatch_payments%ROWTYPE;
  v_expired_count integer := 0;
  v_approval_count integer := 0;
BEGIN
  FOR r IN
    SELECT *
    FROM public.pharmacy_dispatch_requests
    WHERE status = 'searching'
      AND COALESCE(search_started_at, created_at) <= now()
      AND search_timeout_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM public.pharmacy_dispatch_payments active_payment
        WHERE active_payment.dispatch_request_id = r.id
          AND active_payment.status IN ('initializing', 'pending', 'pending_payment')
          AND (active_payment.checkout_url IS NOT NULL OR active_payment.provider_preference_id IS NOT NULL
               OR active_payment.status = 'pending')
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.pharmacy_dispatch_requests
    SET status = 'expired', updated_at = now()
    WHERE id = r.id AND status = 'searching';
    IF NOT FOUND THEN CONTINUE; END IF;
    v_expired_count := v_expired_count + 1;

    SELECT * INTO p FROM public.pharmacy_dispatch_payments
    WHERE dispatch_request_id = r.id AND status = 'approved'
    ORDER BY paid_at DESC NULLS LAST, created_at DESC LIMIT 1;

    IF FOUND THEN
      INSERT INTO public.admin_approval_decisions
        (domain,status,proposed_by,summary,risk_reason,impact_scope,payload)
      VALUES ('money','PENDING_HUMAN_APPROVAL','system',
        'Consulta QR pagada expiró sin médico asignado',
        'Pago aprobado sin asignación médica antes del vencimiento',
        'Despacho farmacéutico; reapertura de búsqueda o reembolso del pago',
        jsonb_build_object('action_type','expired_paid_dispatch',
          'dispatch_request_id',r.id,'payment_id',p.id,
          'mp_payment_id',p.provider_payment_id,'amount',p.amount_minor/100.0))
      ON CONFLICT ((payload->>'dispatch_request_id'))
        WHERE payload->>'action_type'='expired_paid_dispatch' DO NOTHING;
      IF FOUND THEN v_approval_count := v_approval_count + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('expired_count',v_expired_count,
    'approval_count',v_approval_count,'executed_at',now());
END;
$function$;

-- Shared activation path for Mercado Pago webhooks and audited manual settlement.
CREATE OR REPLACE FUNCTION public.activate_paid_pharmacy_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $function$
DECLARE
  v_status text;
  v_result jsonb;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;
  IF NEW.paid_at IS NULL THEN RETURN NEW; END IF;

  UPDATE public.pharmacy_dispatch_requests
  SET status = 'searching',
      search_started_at = COALESCE(search_started_at, now()),
      search_timeout_at = now() + interval '25 seconds',
      updated_at = now()
  WHERE id = NEW.dispatch_request_id
    AND status = 'pending_payment'
  RETURNING status::text INTO v_status;

  IF NOT FOUND THEN
    SELECT status::text INTO v_status
    FROM public.pharmacy_dispatch_requests
    WHERE id = NEW.dispatch_request_id;
  END IF;

  IF v_status = 'searching' THEN
    v_result := public.match_dispatch_doctors(NEW.dispatch_request_id);
    UPDATE public.pharmacy_dispatch_requests
    SET dispatch_activation_result = v_result, updated_at = now()
    WHERE id = NEW.dispatch_request_id;
  ELSE
    v_result := jsonb_build_object('success', false, 'code', 'REQUEST_NOT_SEARCHING', 'request_status', v_status);
    UPDATE public.pharmacy_dispatch_requests
    SET dispatch_activation_result = v_result, updated_at = now()
    WHERE id = NEW.dispatch_request_id;
    IF v_status = 'expired' THEN
      INSERT INTO public.admin_approval_decisions
        (domain,status,proposed_by,summary,risk_reason,impact_scope,payload)
      VALUES ('money','PENDING_HUMAN_APPROVAL','system',
        'Pago aprobado después del vencimiento de la consulta',
        'El pago se confirmó cuando la solicitud ya no estaba buscando médico',
        'Despacho farmacéutico; reapertura de búsqueda o reembolso',
        jsonb_build_object('action_type','expired_paid_dispatch',
          'dispatch_request_id',NEW.dispatch_request_id,'payment_id',NEW.id,
          'mp_payment_id',NEW.provider_payment_id,'amount',NEW.amount_minor/100.0))
      ON CONFLICT ((payload->>'dispatch_request_id'))
        WHERE payload->>'action_type'='expired_paid_dispatch' DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_jordan_dispatch_after_payment_approval ON public.pharmacy_dispatch_payments;
DROP TRIGGER IF EXISTS trg_activate_paid_pharmacy_dispatch ON public.pharmacy_dispatch_payments;
CREATE TRIGGER trg_activate_paid_pharmacy_dispatch
AFTER INSERT OR UPDATE ON public.pharmacy_dispatch_payments
FOR EACH ROW
WHEN (NEW.status = 'approved')
EXECUTE FUNCTION public.activate_paid_pharmacy_dispatch();

-- Manual approvals must surface the actual dispatch result, not a financial-only success.
CREATE OR REPLACE FUNCTION public.admin_manual_approve_pharmacy_payment(
  p_payment_id uuid, p_actor_id uuid, p_reason text, p_evidence_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public','app_private'
AS $function$
DECLARE
  v_payment public.pharmacy_dispatch_payments%ROWTYPE;
  v_request public.pharmacy_dispatch_requests%ROWTYPE;
  v_original_provider_payment_id text;
  v_override_at timestamptz := now();
  v_dispatch_result jsonb;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id=p_actor_id AND active IS TRUE
      AND role IN ('admin','platform_admin','organization_admin')
  ) THEN RAISE EXCEPTION 'active_admin_required' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason))<10 OR length(p_reason)>2000
    OR p_evidence_reference IS NULL OR length(btrim(p_evidence_reference))<4
    OR length(p_evidence_reference)>300
  THEN RAISE EXCEPTION 'manual_override_reason_and_evidence_required' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_payment FROM public.pharmacy_dispatch_payments
  WHERE id=p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'code','PAYMENT_NOT_FOUND'); END IF;
  IF v_payment.status NOT IN ('pending','pending_payment') THEN
    RETURN jsonb_build_object('success',false,'code','PAYMENT_NOT_PENDING');
  END IF;

  v_original_provider_payment_id := v_payment.provider_payment_id;
  UPDATE public.pharmacy_dispatch_payments
  SET status='approved',
      provider_payment_id=COALESCE(provider_payment_id,'MANUAL_OVERRIDE_'||p_actor_id::text),
      paid_at=COALESCE(paid_at,v_override_at),
      metadata=jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(COALESCE(metadata,'{}'::jsonb),
                '{manual_override_by}',to_jsonb(p_actor_id),true),
              '{manual_override_at}',to_jsonb(v_override_at),true),
            '{manual_override_reason}',to_jsonb(btrim(p_reason)),true),
          '{manual_override_evidence_reference}',to_jsonb(btrim(p_evidence_reference)),true),
        '{manual_approval_pending}','false'::jsonb,true)
  WHERE id=p_payment_id RETURNING * INTO v_payment;

  SELECT * INTO v_request FROM public.pharmacy_dispatch_requests
  WHERE id=v_payment.dispatch_request_id;
  v_dispatch_result := COALESCE(v_request.dispatch_activation_result,
    jsonb_build_object('success',false,'code','DISPATCH_RESULT_UNAVAILABLE',
      'request_status',v_request.status));

  INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,metadata)
  VALUES (p_actor_id,'pharmacy_payment_manual_override_approved',
    'pharmacy_dispatch_payments',v_payment.id,
    jsonb_build_object('dispatch_request_id',v_payment.dispatch_request_id,
      'provider_payment_id',v_payment.provider_payment_id,
      'original_provider_payment_id',v_original_provider_payment_id,
      'manual_override_at',v_payment.paid_at,'reason',btrim(p_reason),
      'evidence_reference',btrim(p_evidence_reference),'approved_by',p_actor_id,
      'dispatch_result',v_dispatch_result));

  RETURN jsonb_build_object(
    'success',COALESCE((v_dispatch_result->>'success')::boolean,false),
    'payment_approved',true,
    'code',CASE WHEN COALESCE((v_dispatch_result->>'success')::boolean,false)
      THEN 'PAYMENT_AND_DISPATCH_ACTIVATED' ELSE COALESCE(v_dispatch_result->>'code','DISPATCH_NOT_CONFIRMED') END,
    'payment_id',v_payment.id,'dispatch_request_id',v_payment.dispatch_request_id,
    'status',v_payment.status,'provider_payment_id',v_payment.provider_payment_id,
    'manual_override_by',p_actor_id,'dispatch_result',v_dispatch_result
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manual_approve_pharmacy_payment(uuid,uuid,text,text) TO service_role;
