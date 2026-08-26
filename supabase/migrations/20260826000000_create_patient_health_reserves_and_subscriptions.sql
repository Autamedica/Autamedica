-- ============================================================================
-- AUTAMÉDICA BRASIL: DOMINIO DE RESERVA DE SAÚDE & BENEFÍCIOS ACUMULATIVOS
-- 
-- Arquitectura Fintech / Healthtech:
-- 1. patient_subscriptions: Gestión de membresías (Free vs Cuidado R$ 49,90/mes).
-- 2. patient_health_reserves: Balance de AUTA Créditos (Unidades de beneficio, no dinero).
-- 3. patient_health_reserve_ledger: Ledger inmutable de doble entrada con idempotencia.
-- 4. benefit_catalog_items: Catálogo de servicios y precios de canje en red conveniada.
-- 5. benefit_vouchers: Vouchers de canje emitidos a pacientes para atención en red.
-- 6. partner_settlements: Liquidación de tarifas mayoristas B2B a prestadores de red.
-- ============================================================================

-- ── 1. ENUMS Y TIPOS DE DOMINIO ─────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.patient_subscription_tier AS ENUM ('free', 'cuidado');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.patient_subscription_status AS ENUM ('active', 'past_due', 'cancelled', 'trialing');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.reserve_transaction_kind AS ENUM (
    'monthly_benefit_accrual', -- +22 créditos por mes sin uso de atención clínica
    'benefit_consumed',        -- +0 créditos: registro de auditoría de uso de teleconsulta mensual
    'redeem_specialist',       -- Deducción por consulta con especialista en red
    'redeem_laboratory',       -- Deducción por exámenes de laboratorio
    'redeem_imaging',          -- Deducción por estudios de imagen
    'redeem_pharmacy',         -- Deducción por medicamentos en farmacia conveniada
    'expiration',              -- Expiración reglamentaria de puntos
    'adjustment',              -- Ajuste administrativo auditado
    'refund'                   -- Reversión de canje cancelado
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.benefit_catalog_category AS ENUM (
    'consultation',
    'lab_exam',
    'imaging',
    'medication'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.voucher_status AS ENUM (
    'issued',     -- Emitido al paciente
    'redeemed',   -- Presentado y validado en prestador
    'settled',    -- Liquidado financieramente al prestador
    'cancelled',  -- Cancelado antes de uso (reembolsa créditos)
    'expired'     -- Vencido por plazo de validez
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_settlement_status AS ENUM (
    'pending',
    'processing',
    'paid',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;


-- ── 2. TABLAS PRINCIPALES ───────────────────────────────────────────────────

-- A. Suscripciones de Pacientes (Free vs Cuidado R$ 49,90)
CREATE TABLE IF NOT EXISTS public.patient_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  tier public.patient_subscription_tier NOT NULL DEFAULT 'free',
  status public.patient_subscription_status NOT NULL DEFAULT 'active',
  price_cents integer NOT NULL DEFAULT 0, -- R$ 49,90 = 4990
  currency text NOT NULL DEFAULT 'BRL',
  payment_provider text NULL, -- 'mercadopago', 'asaas', 'stripe', 'pix_automatico'
  provider_subscription_id text NULL,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  cancelled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_patient_subscription UNIQUE (patient_id),
  CONSTRAINT chk_patient_sub_currency CHECK (currency IN ('BRL', 'ARS', 'USD'))
);

-- B. Billetera de Reserva de Saúde (Unidades de Beneficio: AUTA Créditos)
CREATE TABLE IF NOT EXISTS public.patient_health_reserves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  benefit_balance integer NOT NULL DEFAULT 0 CHECK (benefit_balance >= 0),
  max_cap_credits integer NOT NULL DEFAULT 600 CHECK (max_cap_credits > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_patient_health_reserve UNIQUE (patient_id)
);

-- C. Ledger Inmutable de la Reserva de Saúde (Doble Entrada / Auditoría)
CREATE TABLE IF NOT EXISTS public.patient_health_reserve_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserve_id uuid NOT NULL REFERENCES public.patient_health_reserves(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  amount_credits integer NOT NULL, -- Positivo (acumulación/reversión), 0 (benefit_consumed), Negativo (canje)
  kind public.reserve_transaction_kind NOT NULL,
  ref text NOT NULL, -- Llave única de idempotencia
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  voucher_id uuid NULL,
  appointment_id uuid NULL REFERENCES public.appointments(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_reserve_ledger_ref UNIQUE (ref)
);

CREATE INDEX IF NOT EXISTS idx_reserve_ledger_patient_created
  ON public.patient_health_reserve_ledger(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reserve_ledger_ref
  ON public.patient_health_reserve_ledger(ref);

-- D. Catálogo de Servicios y Precios de Canje en Red Conveniada
CREATE TABLE IF NOT EXISTS public.benefit_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.benefit_catalog_category NOT NULL,
  name text NOT NULL,
  description text NULL,
  market_reference_price_cents integer NOT NULL CHECK (market_reference_price_cents >= 0),
  negotiated_b2b_cost_cents integer NOT NULL CHECK (negotiated_b2b_cost_cents >= 0),
  redemption_credits integer NOT NULL CHECK (redemption_credits > 0),
  partner_name text NOT NULL,
  partner_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_benefit_catalog_category_active
  ON public.benefit_catalog_items(category, is_active);

-- E. Vouchers de Canje Emitidos
CREATE TABLE IF NOT EXISTS public.benefit_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  reserve_id uuid NOT NULL REFERENCES public.patient_health_reserves(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES public.benefit_catalog_items(id),
  voucher_code text NOT NULL,
  credits_spent integer NOT NULL CHECK (credits_spent > 0),
  b2b_cost_cents integer NOT NULL CHECK (b2b_cost_cents >= 0),
  copay_amount_cents integer NOT NULL DEFAULT 0 CHECK (copay_amount_cents >= 0),
  status public.voucher_status NOT NULL DEFAULT 'issued',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  redeemed_at timestamptz NULL,
  redeemed_by_partner text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_benefit_voucher_code UNIQUE (voucher_code)
);

CREATE INDEX IF NOT EXISTS idx_benefit_vouchers_patient
  ON public.benefit_vouchers(patient_id, status);

CREATE INDEX IF NOT EXISTS idx_benefit_vouchers_code
  ON public.benefit_vouchers(voucher_code);

-- F. Liquidaciones a Prestadores de Red (Partner Settlements)
CREATE TABLE IF NOT EXISTS public.partner_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_payout_cents integer NOT NULL CHECK (total_payout_cents >= 0),
  vouchers_count integer NOT NULL CHECK (vouchers_count >= 0),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status public.partner_settlement_status NOT NULL DEFAULT 'pending',
  settled_at timestamptz NULL,
  reference_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ── 3. ROW LEVEL SECURITY (RLS) ─────────────────────────────────────────────

ALTER TABLE public.patient_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_health_reserves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_health_reserve_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_settlements ENABLE ROW LEVEL SECURITY;

-- Subscripciones: Paciente solo lee la suya
CREATE POLICY patient_subs_select_own ON public.patient_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_subscriptions.patient_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY patient_subs_service_all ON public.patient_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Reservas: Paciente solo lee la suya
CREATE POLICY patient_reserves_select_own ON public.patient_health_reserves
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_health_reserves.patient_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY patient_reserves_service_all ON public.patient_health_reserves
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Ledger: Paciente solo lee sus movimientos
CREATE POLICY reserve_ledger_select_own ON public.patient_health_reserve_ledger
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_health_reserve_ledger.patient_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY reserve_ledger_service_all ON public.patient_health_reserve_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Catálogo de Beneficios: Público para lectura si está activo
CREATE POLICY catalog_select_active ON public.benefit_catalog_items
  FOR SELECT
  USING (is_active = true OR auth.role() = 'service_role');

CREATE POLICY catalog_service_all ON public.benefit_catalog_items
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Vouchers: Paciente solo lee los propios
CREATE POLICY vouchers_select_own ON public.benefit_vouchers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = benefit_vouchers.patient_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY vouchers_service_all ON public.benefit_vouchers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Settlements: Prestador solo lee los propios
CREATE POLICY settlements_partner_select ON public.partner_settlements
  FOR SELECT
  USING (partner_id = auth.uid());

CREATE POLICY settlements_service_all ON public.partner_settlements
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ── 4. FUNCIONES ATÓMICAS E IDEMPOTENTES (STORED PROCEDURES) ────────────────

-- Función 1: Asegurar que el paciente tenga registro de Reserva de Saúde
CREATE OR REPLACE FUNCTION public.ensure_patient_health_reserve(p_patient_id uuid)
RETURNS public.patient_health_reserves
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_reserve public.patient_health_reserves;
BEGIN
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_id_required';
  END IF;

  INSERT INTO public.patient_health_reserves (patient_id, benefit_balance, max_cap_credits)
  VALUES (p_patient_id, 0, 600)
  ON CONFLICT (patient_id) DO NOTHING;

  SELECT *
  INTO v_reserve
  FROM public.patient_health_reserves
  WHERE patient_id = p_patient_id;

  RETURN v_reserve;
END;
$$;


-- Función 2: Obtener Estado y Balance de Reserva de Saúde
CREATE OR REPLACE FUNCTION public.patient_health_reserve_get_balance(p_patient_id uuid DEFAULT NULL)
RETURNS TABLE (
  patient_id uuid,
  benefit_balance integer,
  max_cap_credits integer,
  status text,
  subscription_tier public.patient_subscription_tier,
  subscription_status public.patient_subscription_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_patient_id uuid;
  v_reserve public.patient_health_reserves;
  v_sub public.patient_subscriptions;
BEGIN
  IF p_patient_id IS NOT NULL THEN
    v_patient_id := p_patient_id;
  ELSE
    SELECT p.id
    INTO v_patient_id
    FROM public.patients p
    WHERE p.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_patient_id IS NULL THEN
    RETURN;
  END IF;

  v_reserve := public.ensure_patient_health_reserve(v_patient_id);

  SELECT *
  INTO v_sub
  FROM public.patient_subscriptions ps
  WHERE ps.patient_id = v_patient_id;

  patient_id := v_patient_id;
  benefit_balance := COALESCE(v_reserve.benefit_balance, 0);
  max_cap_credits := COALESCE(v_reserve.max_cap_credits, 600);
  status := COALESCE(v_reserve.status, 'active');
  subscription_tier := COALESCE(v_sub.tier, 'free'::public.patient_subscription_tier);
  subscription_status := COALESCE(v_sub.status, 'active'::public.patient_subscription_status);
  
  RETURN NEXT;
END;
$$;


-- Función 3: Devengamiento Mensual de Beneficios (Webhook de Renovación)
-- Regla de Negocio:
-- Plan Cuidado (R$ 49,90):
-- - Si usó el beneficio de atención clínica: +0 créditos (registrado como benefit_consumed para auditoría).
-- - Si NO usó el beneficio: +22 AUTA Créditos (hasta el tope de 600 créditos).
CREATE OR REPLACE FUNCTION public.process_monthly_reserve_accrual(
  p_patient_id uuid,
  p_subscription_id text,
  p_tier public.patient_subscription_tier,
  p_used_monthly_benefit boolean,
  p_appointment_id uuid DEFAULT NULL
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

  -- Clave de período mensual para idempotencia estricta
  v_period_key := to_char(now(), 'YYYY-MM');
  v_idempotency_key := 'reserve_accrual:' || COALESCE(p_subscription_id, p_patient_id::text) || ':' || v_period_key;

  -- Verificar si ya se procesó este período
  IF EXISTS (
    SELECT 1 FROM public.patient_health_reserve_ledger
    WHERE ref = v_idempotency_key
  ) THEN
    RETURN jsonb_build_object('success', true, 'message', 'Monthly accrual already processed for this period');
  END IF;

  -- Asegurar y bloquear la reserva para actualización atómica
  PERFORM public.ensure_patient_health_reserve(p_patient_id);

  SELECT * INTO v_reserve
  FROM public.patient_health_reserves
  WHERE patient_id = p_patient_id
  FOR UPDATE;

  IF p_used_monthly_benefit THEN
    -- Caso 1: Consumió el beneficio de atención clínica del mes
    v_accrual_credits := 0;
    v_new_balance := v_reserve.benefit_balance;
    v_kind := 'benefit_consumed';

    INSERT INTO public.patient_health_reserve_ledger (
      reserve_id, patient_id, amount_credits, kind, ref, balance_after, appointment_id, metadata
    ) VALUES (
      v_reserve.id, p_patient_id, 0, v_kind, v_idempotency_key, v_new_balance, p_appointment_id,
      jsonb_build_object('reason', 'Benefício de atendimento do mês utilizado', 'tier', p_tier, 'period', v_period_key)
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
      v_accrual_credits := v_new_balance - v_reserve.benefit_balance;
    END IF;

    UPDATE public.patient_health_reserves
    SET benefit_balance = v_new_balance, updated_at = now()
    WHERE id = v_reserve.id;

    INSERT INTO public.patient_health_reserve_ledger (
      reserve_id, patient_id, amount_credits, kind, ref, balance_after, metadata
    ) VALUES (
      v_reserve.id, p_patient_id, v_accrual_credits, v_kind, v_idempotency_key, v_new_balance,
      jsonb_build_object('reason', 'Acumulação de Reserva de Saúde por mensalidade sem uso', 'tier', p_tier, 'period', v_period_key)
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


-- Función 4: Canje Atómico de Beneficios (Emisión de Voucher de Red)
CREATE OR REPLACE FUNCTION public.redeem_reserve_benefit(
  p_patient_id uuid,
  p_catalog_item_id uuid,
  p_copay_amount_cents integer DEFAULT 0,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_reserve public.patient_health_reserves;
  v_catalog_item public.benefit_catalog_items;
  v_new_balance integer;
  v_voucher_id uuid;
  v_transaction_id uuid;
  v_voucher_code text;
  v_kind public.reserve_transaction_kind;
  v_ref text;
  v_existing_voucher public.benefit_vouchers;
BEGIN
  IF p_patient_id IS NULL OR p_catalog_item_id IS NULL THEN
    RAISE EXCEPTION 'patient_and_catalog_item_required';
  END IF;

  -- Chequeo previo de idempotencia si se proporcionó clave
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    v_ref := 'voucher_redemption:' || btrim(p_idempotency_key);
    SELECT v.* INTO v_existing_voucher
    FROM public.benefit_vouchers v
    JOIN public.patient_health_reserve_ledger l ON l.voucher_id = v.id
    WHERE l.ref = v_ref AND v.patient_id = p_patient_id;

    IF FOUND THEN
      SELECT benefit_balance INTO v_new_balance
      FROM public.patient_health_reserves
      WHERE patient_id = p_patient_id;

      RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_existing_voucher.id,
        'voucher_code', v_existing_voucher.voucher_code,
        'credits_spent', v_existing_voucher.credits_spent,
        'new_balance', COALESCE(v_new_balance, 0),
        'expires_at', v_existing_voucher.expires_at,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- Bloqueo pesimista de fila para prevenir doble gasto concurrente
  SELECT * INTO v_reserve
  FROM public.patient_health_reserves
  WHERE patient_id = p_patient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'health_reserve_not_found';
  END IF;

  IF v_reserve.status <> 'active' THEN
    RAISE EXCEPTION 'health_reserve_suspended';
  END IF;

  -- Obtener item del catálogo activo
  SELECT * INTO v_catalog_item
  FROM public.benefit_catalog_items
  WHERE id = p_catalog_item_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'catalog_item_not_found_or_inactive';
  END IF;

  -- Validar saldo suficiente de AUTA Créditos
  IF v_reserve.benefit_balance < v_catalog_item.redemption_credits THEN
    RAISE EXCEPTION 'insufficient_benefit_balance: required %, available %',
      v_catalog_item.redemption_credits, v_reserve.benefit_balance;
  END IF;

  -- Determinar categoría de transacción
  v_kind := CASE v_catalog_item.category
    WHEN 'consultation' THEN 'redeem_specialist'::public.reserve_transaction_kind
    WHEN 'lab_exam' THEN 'redeem_laboratory'::public.reserve_transaction_kind
    WHEN 'imaging' THEN 'redeem_imaging'::public.reserve_transaction_kind
    WHEN 'medication' THEN 'redeem_pharmacy'::public.reserve_transaction_kind
    ELSE 'redeem_specialist'::public.reserve_transaction_kind
  END;

  v_new_balance := v_reserve.benefit_balance - v_catalog_item.redemption_credits;

  -- Generación de código único de voucher (ej: "AUTA-7F4B9E21")
  v_voucher_code := 'AUTA-' || upper(substring(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 8));
  v_ref := COALESCE(v_ref, 'voucher_redemption:' || v_voucher_code);

  -- Crear Voucher Digital
  INSERT INTO public.benefit_vouchers (
    patient_id, reserve_id, catalog_item_id, voucher_code,
    credits_spent, b2b_cost_cents, copay_amount_cents, status, expires_at,
    metadata
  ) VALUES (
    p_patient_id, v_reserve.id, p_catalog_item_id, v_voucher_code,
    v_catalog_item.redemption_credits, v_catalog_item.negotiated_b2b_cost_cents,
    COALESCE(p_copay_amount_cents, 0), 'issued', now() + interval '60 days',
    jsonb_build_object('item_name', v_catalog_item.name, 'partner_name', v_catalog_item.partner_name)
  ) RETURNING id INTO v_voucher_id;

  -- Actualizar balance de la Reserva
  UPDATE public.patient_health_reserves
  SET benefit_balance = v_new_balance, updated_at = now()
  WHERE id = v_reserve.id;

  -- Registrar en Ledger Inmutable
  INSERT INTO public.patient_health_reserve_ledger (
    reserve_id, patient_id, amount_credits, kind, ref, balance_after, voucher_id, metadata
  ) VALUES (
    v_reserve.id, p_patient_id, -v_catalog_item.redemption_credits, v_kind, v_ref, v_new_balance, v_voucher_id,
    jsonb_build_object(
      'voucher_code', v_voucher_code,
      'item_name', v_catalog_item.name,
      'category', v_catalog_item.category,
      'market_reference_price_cents', v_catalog_item.market_reference_price_cents,
      'negotiated_b2b_cost_cents', v_catalog_item.negotiated_b2b_cost_cents
    )
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'voucher_id', v_voucher_id,
    'voucher_code', v_voucher_code,
    'credits_spent', v_catalog_item.redemption_credits,
    'new_balance', v_new_balance,
    'expires_at', (now() + interval '60 days')
  );
END;
$$;


-- ── 5. SEED INICIAL DEL CATÁLOGO DE BENEFICIOS (TABLA B2B DE RED) ───────────

INSERT INTO public.benefit_catalog_items (
  category, name, description, market_reference_price_cents, negotiated_b2b_cost_cents, redemption_credits, partner_name, is_active
) VALUES
(
  'consultation',
  'Interconsulta Especialista: Cardiologia / Dermatologia',
  'Consulta especializada presencial ou telemedicina com especialista da rede credenciada.',
  15000, -- R$ 150,00
  8000,  -- R$ 80,00 (Custo B2B AutaMedica)
  100,   -- 100 AUTA Créditos
  'Rede Médica Especializada AutaMedica',
  true
),
(
  'lab_exam',
  'Check-up Laboratorial Completo (Hemograma, Perfil Lipídico, Glicemia)',
  'Painel completo de exames de rotina preventiva em laboratórios parceiros (Dasa / Sabin).',
  12000, -- R$ 120,00
  3500,  -- R$ 35,00 (Custo B2B AutaMedica)
  60,    -- 60 AUTA Créditos
  'Rede Diagnóstica / Laboratórios Parceiros',
  true
),
(
  'medication',
  'Voucher Farmácia: Medicamentos de Uso Contínuo (Hipertensão / Diabetes)',
  'Crédito direto para retirada de medicamentos essenciais em redes conveniadas.',
  8000,  -- R$ 80,00
  4500,  -- R$ 45,00 (Custo B2B AutaMedica)
  55,    -- 55 AUTA Créditos
  'Rede Farmacêutica Conveniada',
  true
)
ON CONFLICT DO NOTHING;


-- ── 6. PERMISOS DE EJECUCIÓN ────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.ensure_patient_health_reserve(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.patient_health_reserve_get_balance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_monthly_reserve_accrual(uuid, text, public.patient_subscription_tier, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_reserve_benefit(uuid, uuid, integer, text) TO authenticated, service_role;
