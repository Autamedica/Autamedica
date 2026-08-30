-- Migration: Add Brazil Digital Prescription Support (CRM, RQE, CPF, CMED/Anvisa)
-- Date: 2026-08-30 02:15:00
-- Author: AutaMedica Agent

-- 1. Ampliar tipos de matrícula en doctor_licenses para incluir CRM, CRO, CRF y RMS
ALTER TABLE public.doctor_licenses 
  DROP CONSTRAINT IF EXISTS doctor_licenses_license_type_check;

ALTER TABLE public.doctor_licenses 
  ADD CONSTRAINT doctor_licenses_license_type_check 
  CHECK (license_type IN ('MN', 'MP', 'CRM', 'CRO', 'CRF', 'RMS'));

-- Agregar columnas específicas de Brasil en doctor_licenses
ALTER TABLE public.doctor_licenses
  ADD COLUMN IF NOT EXISTS uf_brazil TEXT CHECK (uf_brazil IS NULL OR uf_brazil IN (
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
    'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
    'RS','RO','RR','SC','SP','SE','TO'
  )),
  ADD COLUMN IF NOT EXISTS cfm_validation_status TEXT DEFAULT 'pending' 
    CHECK (cfm_validation_status IN ('pending', 'valid', 'suspended', 'cassado', 'exempt')),
  ADD COLUMN IF NOT EXISTS cfm_last_checked_at TIMESTAMPTZ;

-- 2. Especialidades: Soporte RQE (Registro de Qualificação de Especialista)
ALTER TABLE public.doctor_specialties
  ADD COLUMN IF NOT EXISTS rqe_number TEXT,
  ADD COLUMN IF NOT EXISTS rqe_uf TEXT,
  ADD COLUMN IF NOT EXISTS crm_conselho_regional TEXT;

-- 3. Documento CPF en perfiles y pacientes
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS cns TEXT; -- Cartão Nacional de Saúde (SUS)

CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON public.profiles(cpf);
CREATE INDEX IF NOT EXISTS idx_patients_cpf ON public.patients(cpf);

-- 4. Extensión de la tabla de Prescripciones para Soporte Multi-País
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'AR' CHECK (country_code IN ('AR', 'BR', 'UY', 'CL', 'MX')),
  ADD COLUMN IF NOT EXISTS prescription_model_br TEXT CHECK (prescription_model_br IS NULL OR prescription_model_br IN (
    'simples',           -- Receita Simples (Uso contínuo / Isentos)
    'controle_especial',  -- Receita de Controle Especial (Portaria 344/98 Lista C1/C5)
    'antimicrobiano',    -- Receita de Antimicrobianos (RDC 20/2011)
    'notificacao_a',     -- Notificação de Receita A (Amarela - Entorpecentes)
    'notificacao_b'      -- Notificação de Receita B (Azul - Psicotrópicos)
  )),
  ADD COLUMN IF NOT EXISTS iti_validation_url TEXT,
  ADD COLUMN IF NOT EXISTS icp_signature_metadata JSONB;

-- 5. Catálogo de Medicamentos Anvisa / CMED
CREATE TABLE IF NOT EXISTS public.medications_cmed_br (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_anvisa TEXT NOT NULL,
  principio_ativo TEXT NOT NULL,       -- DCB (Denominação Comum Brasileira)
  nome_comercial TEXT NOT NULL,
  apresentacao TEXT NOT NULL,
  classe_terapeutica TEXT,
  laboratorio TEXT NOT NULL,
  tipo_receita TEXT NOT NULL DEFAULT 'simples' CHECK (tipo_receita IN (
    'isento', 'simples', 'antimicrobiano', 'controle_especial', 'notificacao_a', 'notificacao_b'
  )),
  tarja TEXT CHECK (tarja IS NULL OR tarja IN ('sem_tarja', 'tarja_vermelha', 'tarja_preta')),
  lista_portaria_344 TEXT, -- 'A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4', 'C5'
  preco_maximo_consumidor NUMERIC(10, 2),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmed_registro_anvisa ON public.medications_cmed_br(registro_anvisa);
CREATE INDEX IF NOT EXISTS idx_cmed_tipo_receita ON public.medications_cmed_br(tipo_receita);

-- RLS para CMED
ALTER TABLE public.medications_cmed_br ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Medications CMED readable by authenticated users" ON public.medications_cmed_br;
CREATE POLICY "Medications CMED readable by authenticated users" 
  ON public.medications_cmed_br FOR SELECT TO authenticated USING (ativo = true);
