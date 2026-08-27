-- ============================================================================
-- AUTAMÉDICA BRASIL: CRON & BATCH DE DEVENGAMIENTO MENSUAL (RESERVA DE SAÚDE)
--
-- 1. Actualiza `process_monthly_reserve_accrual` para aceptar `p_period_key` dinámico.
-- 2. Crea `process_all_monthly_reserve_accruals` para evaluar todas las suscripciones activas del Plan Cuidado.
-- 3. Programa el cron job con `pg_cron` el día 1 de cada mes a las 00:05 UTC.
-- ============================================================================

-- ── 1. FUNCIÓN INDIVIDUAL CON PERIOD_KEY DINÁMICO ───────────────────────────

CREATE OR REPLACE FUNCTION public.process_monthly_reserve_accrual(
  p_patient_id uuid,
  p_subscription_id text,
  p_tier public.patient_subscription_tier,
  p_used_monthly_benefit boolean,
  p_appointment_id uuid DEFAULT NULL,
  p_period_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_reserve public.patient_health_reserves;
  v_accrual_credits integer := 0;
  v_new_balance integer;
  v_transaction_id uuid;
  v_idempotency_key text;
  v_period_key text;
  v_kind public.reserve_transaction_kind;
BEGIN
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_id_required';
  END IF;

  -- Solo el plan Cuidado acumula Reserva de Saúde
  IF p_tier <> 'cuidado' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Tier does not accumulate health reserve');
  END IF;

  -- Clave de período mensual (por defecto el mes en curso YYYY-MM)
  v_period_key := COALESCE(p_period_key, to_char(now(), 'YYYY-MM'));
  v_idempotency_key := 'reserve_accrual:' || COALESCE(p_subscription_id, p_patient_id::text) || ':' || v_period_key;

  -- Verificar si ya se procesó este período (Idempotencia estricta)
  IF EXISTS (
    SELECT 1 FROM public.patient_health_reserve_ledger
    WHERE ref = v_idempotency_key
  ) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Monthly accrual already processed for this period', 'skipped', true);
  END IF;

  -- Asegurar y bloquear la reserva para actualización atómica
  PERFORM public.ensure_patient_health_reserve(p_patient_id);

  SELECT * INTO v_reserve
  FROM public.patient_health_reserves
  WHERE patient_id = p_patient_id
  FOR UPDATE;

  IF p_used_monthly_benefit THEN
    -- Caso 1: Consumió el beneficio de atención clínica del mes (+0 créditos)
    v_accrual_credits := 0;
    v_new_balance := v_reserve.benefit_balance;
    v_kind := 'benefit_consumed';

    INSERT INTO public.patient_health_reserve_ledger (
      reserve_id, patient_id, amount_credits, kind, ref, balance_after, appointment_id, metadata
    ) VALUES (
      v_reserve.id, p_patient_id, 0, v_kind, v_idempotency_key, v_new_balance, p_appointment_id,
      jsonb_build_object(
        'reason', 'Benefício de atendimento do mês utilizado',
        'tier', p_tier,
        'period', v_period_key,
        'appointment_id', p_appointment_id
      )
    ) RETURNING id INTO v_transaction_id;

    RETURN jsonb_build_object(
      'success', true,
      'kind', 'benefit_consumed',
      'credits_added', 0,
      'new_balance', v_new_balance,
      'transaction_id', v_transaction_id
    );
  ELSE
    -- Caso 2: No consumió la consulta -> Se acreditan +22 AUTA Créditos
    v_accrual_credits := 22;
    v_new_balance := v_reserve.benefit_balance + v_accrual_credits;
    v_kind := 'monthly_benefit_accrual';

    -- Respetar cap máximo (600 créditos)
    IF v_new_balance > v_reserve.max_cap_credits THEN
      v_new_balance := v_reserve.max_cap_credits;
      v_accrual_credits := GREATEST(v_new_balance - v_reserve.benefit_balance, 0);
    END IF;

    UPDATE public.patient_health_reserves
    SET benefit_balance = v_new_balance, updated_at = now()
    WHERE id = v_reserve.id;

    INSERT INTO public.patient_health_reserve_ledger (
      reserve_id, patient_id, amount_credits, kind, ref, balance_after, metadata
    ) VALUES (
      v_reserve.id, p_patient_id, v_accrual_credits, v_kind, v_idempotency_key, v_new_balance,
      jsonb_build_object(
        'reason', 'Acumulação de Reserva de Saúde por mensalidade sem uso',
        'tier', p_tier,
        'period', v_period_key
      )
    ) RETURNING id INTO v_transaction_id;

    RETURN jsonb_build_object(
      'success', true,
      'kind', 'monthly_benefit_accrual',
      'credits_added', v_accrual_credits,
      'new_balance', v_new_balance,
      'transaction_id', v_transaction_id
    );
  END IF;
END;
$$;


-- ── 2. FUNCIÓN BATCH PARA TODAS LAS SUSCRIPCIONES ACTIVAS ──────────────────

CREATE OR REPLACE FUNCTION public.process_all_monthly_reserve_accruals(
  p_period_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_effective_period text;
  v_sub record;
  v_appointment_id uuid;
  v_used_benefit boolean;
  v_processed_count integer := 0;
  v_credits_accrued_count integer := 0;
  v_benefits_consumed_count integer := 0;
  v_skipped_count integer := 0;
  v_res jsonb;
BEGIN
  v_effective_period := COALESCE(p_period_key, to_char(now(), 'YYYY-MM'));

  FOR v_sub IN
    SELECT 
      ps.id AS subscription_id,
      ps.patient_id,
      ps.tier,
      ps.status,
      ps.current_period_start,
      ps.current_period_end
    FROM public.patient_subscriptions ps
    WHERE ps.tier = 'cuidado'
      AND ps.status IN ('active', 'trialing')
  LOOP
    -- Verificar si el paciente tuvo alguna cita completada/confirmada en este periodo
    SELECT a.id
    INTO v_appointment_id
    FROM public.appointments a
    WHERE a.patient_id = v_sub.patient_id
      AND a.status IN ('confirmed', 'completed', 'in_progress')
      AND (
        (a.start_time >= v_sub.current_period_start AND a.start_time < v_sub.current_period_end)
        OR (a.created_at >= v_sub.current_period_start AND a.created_at < v_sub.current_period_end)
      )
    LIMIT 1;

    v_used_benefit := (v_appointment_id IS NOT NULL);

    v_res := public.process_monthly_reserve_accrual(
      p_patient_id := v_sub.patient_id,
      p_subscription_id := v_sub.subscription_id::text,
      p_tier := v_sub.tier,
      p_used_monthly_benefit := v_used_benefit,
      p_appointment_id := v_appointment_id,
      p_period_key := v_effective_period
    );

    v_processed_count := v_processed_count + 1;

    IF (v_res->>'kind') = 'monthly_benefit_accrual' THEN
      v_credits_accrued_count := v_credits_accrued_count + 1;
    ELSIF (v_res->>'kind') = 'benefit_consumed' THEN
      v_benefits_consumed_count := v_benefits_consumed_count + 1;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'period', v_effective_period,
    'total_evaluated', v_processed_count,
    'credits_accrued', v_credits_accrued_count,
    'benefits_consumed', v_benefits_consumed_count,
    'skipped_or_already_processed', v_skipped_count,
    'executed_at', now()
  );
END;
$$;


-- ── 3. PERMISOS DE EJECUCIÓN ────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.process_monthly_reserve_accrual(uuid, text, public.patient_subscription_tier, boolean, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_all_monthly_reserve_accruals(text) TO service_role;


-- ── 4. PROGRAMACIÓN AUTOMÁTICA CON PG_CRON ──────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('autamedica-monthly-reserve-accrual');
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'autamedica-monthly-reserve-accrual',
      '5 0 1 * *', -- El día 1 de cada mes a las 00:05 UTC
      $$ SELECT public.process_all_monthly_reserve_accruals(); $$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
