-- ============================================================
-- Doctor Accounting Module — Argentina Tax System
-- Supports Monotributo and Responsable Inscripto regimes
-- ============================================================

-- 1. Tax regime enum
DO $$ BEGIN
  CREATE TYPE public.tax_regime AS ENUM ('monotributo', 'responsable_inscripto');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Monotributo categories
DO $$ BEGIN
  CREATE TYPE public.monotributo_category AS ENUM ('A','B','C','D','E','F','G','H','I','J','K');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Invoice type
DO $$ BEGIN
  CREATE TYPE public.invoice_type AS ENUM ('A','B','C','M','E');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Doctor fiscal profile
CREATE TABLE IF NOT EXISTS public.doctor_fiscal_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  tax_regime public.tax_regime NOT NULL DEFAULT 'monotributo',
  cuit TEXT NOT NULL,
  monotributo_category public.monotributo_category,
  iibb_number TEXT,
  iibb_jurisdiction TEXT DEFAULT 'CABA',
  iibb_convenio_multilateral BOOLEAN NOT NULL DEFAULT false,
  invoice_type public.invoice_type NOT NULL DEFAULT 'C',
  fiscal_start_date DATE,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(doctor_id)
);

-- 5. Income records (honorarios, consultas, obras sociales)
CREATE TABLE IF NOT EXISTS public.doctor_income_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  fiscal_profile_id UUID NOT NULL REFERENCES public.doctor_fiscal_profiles(id),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  source TEXT NOT NULL, -- 'consulta_particular', 'obra_social', 'prepaga', 'clinica', 'otro'
  source_name TEXT, -- nombre de la obra social, clínica, etc.
  description TEXT,
  gross_amount INTEGER NOT NULL, -- en centavos (minor units)
  tax_withheld INTEGER NOT NULL DEFAULT 0, -- retenciones en centavos
  net_amount INTEGER NOT NULL, -- neto percibido en centavos
  invoice_number TEXT,
  invoice_type public.invoice_type,
  invoice_date DATE,
  appointment_id UUID REFERENCES public.appointments(id),
  prescription_id UUID REFERENCES public.prescriptions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Expense records (gastos deducibles)
CREATE TABLE IF NOT EXISTS public.doctor_expense_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  fiscal_profile_id UUID NOT NULL REFERENCES public.doctor_fiscal_profiles(id),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  category TEXT NOT NULL, -- 'alquiler', 'insumos', 'equipamiento', 'formacion', 'seguros', 'transporte', 'servicios', 'honorarios_contador', 'otro'
  description TEXT NOT NULL,
  amount INTEGER NOT NULL, -- en centavos
  iva_amount INTEGER NOT NULL DEFAULT 0, -- IVA del gasto (crédito fiscal para RI)
  deductible BOOLEAN NOT NULL DEFAULT true, -- solo aplica para RI
  receipt_url TEXT,
  supplier_cuit TEXT,
  supplier_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Tax obligations (cuotas monotributo, DDJJ IVA, Ganancias, IIBB, Autónomos)
CREATE TABLE IF NOT EXISTS public.doctor_tax_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  fiscal_profile_id UUID NOT NULL REFERENCES public.doctor_fiscal_profiles(id),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  obligation_type TEXT NOT NULL, -- 'monotributo_cuota', 'iva_ddjj', 'ganancias_anticipo', 'ganancias_anual', 'iibb', 'autonomos', 'recategorizacion'
  amount INTEGER NOT NULL, -- en centavos
  due_date DATE NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  paid_amount INTEGER,
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'exempt')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Monthly fiscal summary (pre-calculated)
CREATE TABLE IF NOT EXISTS public.doctor_fiscal_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id),
  fiscal_profile_id UUID NOT NULL REFERENCES public.doctor_fiscal_profiles(id),
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  total_income INTEGER NOT NULL DEFAULT 0, -- centavos
  total_expenses INTEGER NOT NULL DEFAULT 0,
  total_iva_debito INTEGER NOT NULL DEFAULT 0, -- solo RI
  total_iva_credito INTEGER NOT NULL DEFAULT 0, -- solo RI
  iva_balance INTEGER NOT NULL DEFAULT 0, -- debito - credito
  total_retenciones INTEGER NOT NULL DEFAULT 0,
  net_result INTEGER NOT NULL DEFAULT 0, -- income - expenses
  accumulated_annual_income INTEGER NOT NULL DEFAULT 0, -- acumulado año
  monotributo_category_suggested public.monotributo_category, -- sugerida según facturación
  recategorization_needed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(doctor_id, period_year, period_month)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doctor_income_period ON public.doctor_income_records(doctor_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_doctor_expense_period ON public.doctor_expense_records(doctor_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_doctor_obligations_status ON public.doctor_tax_obligations(doctor_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_doctor_fiscal_summaries_period ON public.doctor_fiscal_summaries(doctor_id, period_year, period_month);

-- RLS
ALTER TABLE public.doctor_fiscal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_income_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_expense_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_tax_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_fiscal_summaries ENABLE ROW LEVEL SECURITY;

-- Doctors see only their own data
CREATE POLICY "doctor_fiscal_profile_own" ON public.doctor_fiscal_profiles
  FOR ALL TO authenticated
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

CREATE POLICY "doctor_income_own" ON public.doctor_income_records
  FOR ALL TO authenticated
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

CREATE POLICY "doctor_expense_own" ON public.doctor_expense_records
  FOR ALL TO authenticated
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

CREATE POLICY "doctor_obligations_own" ON public.doctor_tax_obligations
  FOR ALL TO authenticated
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));

CREATE POLICY "doctor_fiscal_summary_own" ON public.doctor_fiscal_summaries
  FOR ALL TO authenticated
  USING (doctor_id IN (SELECT id FROM public.doctors WHERE user_id = auth.uid()));
