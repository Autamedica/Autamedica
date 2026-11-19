-- Active checkouts and unsettled payments must never be expired while the payment is pending.
CREATE OR REPLACE FUNCTION public.expire_stale_dispatch_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_request public.pharmacy_dispatch_requests%ROWTYPE;
  p public.pharmacy_dispatch_payments%ROWTYPE;
  v_search_expired integer := 0;
  v_matched_expired integer := 0;
  v_in_call_cancelled integer := 0;
  v_calls_closed integer := 0;
  v_approval_count integer := 0;
  v_doctors_released integer := 0;
  v_count integer := 0;
BEGIN
  FOR v_request IN
    SELECT *
    FROM public.pharmacy_dispatch_requests req
    WHERE req.status = 'searching'
      AND COALESCE(req.search_timeout_at,
                   COALESCE(req.search_started_at, req.created_at) + interval '25 seconds') <= now()
      AND NOT EXISTS (
        SELECT 1
        FROM public.pharmacy_dispatch_payments active_payment
        WHERE active_payment.dispatch_request_id = req.id
          AND active_payment.status IN ('initializing', 'pending', 'pending_payment')
      )
    FOR UPDATE OF req SKIP LOCKED
  LOOP
    UPDATE public.pharmacy_dispatch_requests
       SET status = 'expired', updated_at = now()
     WHERE id = v_request.id AND status = 'searching';
    IF NOT FOUND THEN CONTINUE; END IF;
    v_search_expired := v_search_expired + 1;

    SELECT * INTO p
    FROM public.pharmacy_dispatch_payments
    WHERE dispatch_request_id = v_request.id AND status = 'approved'
    ORDER BY paid_at DESC NULLS LAST, created_at DESC
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO public.admin_approval_decisions
        (domain, status, proposed_by, summary, risk_reason, impact_scope, payload)
      VALUES
        ('money', 'PENDING_HUMAN_APPROVAL', 'system',
         'Consulta QR pagada expiró sin médico asignado',
         'Pago aprobado sin asignación médica antes del vencimiento',
         'Despacho farmacéutico; reapertura de búsqueda o reembolso del pago',
         jsonb_build_object(
           'action_type', 'expired_paid_dispatch',
           'dispatch_request_id', v_request.id,
           'payment_id', p.id,
           'mp_payment_id', p.provider_payment_id,
           'amount', p.amount_minor / 100.0
         ))
      ON CONFLICT ((payload->>'dispatch_request_id'))
        WHERE payload->>'action_type' = 'expired_paid_dispatch'
      DO NOTHING;
      IF FOUND THEN v_approval_count := v_approval_count + 1; END IF;
    END IF;
  END LOOP;

  UPDATE public.pharmacy_dispatch_requests AS req
     SET status = 'expired', updated_at = now()
   WHERE req.status = 'matched'
     AND coalesce(req.matched_at, req.updated_at, req.created_at) < now() - interval '60 minutes';
  GET DIAGNOSTICS v_matched_expired = ROW_COUNT;

  UPDATE public.calls AS c
     SET status = CASE WHEN c.status::text = 'connecting' THEN 'ended'::public.call_status
                       ELSE 'canceled'::public.call_status END,
         reason = coalesce(c.reason, 'stale_call_timeout')
   WHERE c.status::text IN ('requested', 'ringing', 'accepted', 'connecting')
     AND c.created_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_calls_closed = ROW_COUNT;

  UPDATE public.pharmacy_dispatch_requests AS req
     SET status = 'cancelled',
         call_ended_at = coalesce(req.call_ended_at, now()),
         updated_at = now()
    FROM public.calls AS c
   WHERE req.status = 'in_call'
     AND req.call_id = c.id
     AND (
       c.status::text IN ('ended', 'canceled', 'declined')
       OR coalesce(c.ended_at, req.updated_at, req.call_started_at, req.created_at)
            < now() - interval '3 hours'
     );
  GET DIAGNOSTICS v_in_call_cancelled = ROW_COUNT;

  UPDATE public.pharmacy_dispatch_requests AS req
     SET status = 'cancelled',
         call_ended_at = coalesce(req.call_ended_at, now()),
         updated_at = now()
   WHERE req.status = 'in_call'
     AND req.call_id IS NULL
     AND coalesce(req.updated_at, req.call_started_at, req.created_at) < now() - interval '3 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_in_call_cancelled := v_in_call_cancelled + v_count;

  UPDATE public.doctor_duty_status AS duty
     SET current_active_request_id = NULL
   WHERE duty.current_active_request_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.pharmacy_dispatch_requests AS req
       WHERE req.id = duty.current_active_request_id
         AND req.status::text IN ('matched', 'in_call')
     );
  GET DIAGNOSTICS v_doctors_released = ROW_COUNT;

  RETURN jsonb_build_object(
    'search_expired_count', v_search_expired,
    'matched_expired_count', v_matched_expired,
    'in_call_cancelled_count', v_in_call_cancelled,
    'calls_closed_count', v_calls_closed,
    'doctor_slots_released_count', v_doctors_released,
    'approval_count', v_approval_count,
    'executed_at', now()
  );
END;
$function$;
