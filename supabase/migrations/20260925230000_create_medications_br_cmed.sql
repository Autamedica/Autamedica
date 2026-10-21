-- AUDIT RECONSTRUCTION - restored from production Supabase migration ledger.
-- Version: 20260925230000; name: create_medications_br_cmed.
-- Draft only. Must be tested on a FULL clean staging schema before merge.

-- =====================================================================
-- Migration: 20260925230000_create_medications_br_cmed.sql
-- Description:
-- Base de datos del Vademécum Brasileño (Tabela CMED da ANVISA)
-- y motor de búsqueda rápida con similitud trigrama (pg_trgm)
-- para prescripción médica y farmacia on-demand.
-- =====================================================================

-- 1. Habilitar extensión pg_trgm para cálculo de similitud y búsqueda difusa
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Crear tabla public.medications_br
CREATE TABLE IF NOT EXISTS public.medications_br (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ean varchar(14) NOT NULL,
    nome_comercial varchar(255) NOT NULL,
    substancia varchar(500) NOT NULL,
    apresentacao text NOT NULL,
    classe_terapeutica varchar(255),
    laboratorio varchar(255) NOT NULL,
    registro_ms varchar(20),
    pmc_20 numeric(10,2),
    tarja varchar(50),
    restricao_hospitalar boolean DEFAULT false,
    ativo boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT uq_medications_br_ean UNIQUE (ean)
);

-- Comentarios explicativos en la tabla y columnas
COMMENT ON TABLE public.medications_br IS 'Vademécum Oficial CMED/ANVISA de Medicamentos en Brasil';

COMMENT ON COLUMN public.medications_br.ean IS 'Código de barras universal EAN-13 / GTIN del medicamento';

COMMENT ON COLUMN public.medications_br.nome_comercial IS 'Nombre comercial registrado ante ANVISA';

COMMENT ON COLUMN public.medications_br.substancia IS 'Principio activo según DCB (Denominação Comum Brasileira)';

COMMENT ON COLUMN public.medications_br.apresentacao IS 'Forma farmacéutica, concentración y empaque';

COMMENT ON COLUMN public.medications_br.classe_terapeutica IS 'Clasificación terapéutica oficial';

COMMENT ON COLUMN public.medications_br.laboratorio IS 'Laboratorio farmacéutico productor o importador';

COMMENT ON COLUMN public.medications_br.registro_ms IS 'Número de registro en el Ministério da Saúde / ANVISA (13 dígitos)';

COMMENT ON COLUMN public.medications_br.pmc_20 IS 'Preço Máximo ao Consumidor com ICMS 20% (Tabela CMED)';

COMMENT ON COLUMN public.medications_br.tarja IS 'Clasificación de tarja (Sem tarja, Vermelha, Preta, Sob retenção)';

COMMENT ON COLUMN public.medications_br.restricao_hospitalar IS 'Indica si su comercialización está restringida al ámbito hospitalario';

COMMENT ON COLUMN public.medications_br.ativo IS 'Estado activo del medicamento en el catálogo';

-- 3. Índices de alta velocidad
-- Índice B-Tree en ean (búsquedas por código de barras físico o virtual)
CREATE INDEX IF NOT EXISTS idx_medications_br_ean 
    ON public.medications_br (ean);

-- Índice GIN Trigram compuesto para autocompletado y búsqueda difusa
CREATE INDEX IF NOT EXISTS idx_medications_br_search_trgm 
    ON public.medications_br 
    USING gin (nome_comercial gin_trgm_ops, substancia gin_trgm_ops);

-- Índice de soporte para filtrado de registros activos
CREATE INDEX IF NOT EXISTS idx_medications_br_ativo 
    ON public.medications_br (ativo) 
    WHERE ativo = true;

-- 4. Row Level Security (RLS) y Políticas de Acceso
ALTER TABLE public.medications_br ENABLE ROW LEVEL SECURITY;

-- Concesión de permisos básicos a roles de Supabase
GRANT SELECT ON public.medications_br TO authenticated;

GRANT ALL ON public.medications_br TO service_role;

-- Política RLS: Solo lectura para usuarios autenticados
DROP POLICY IF EXISTS "medications_br_select_authenticated" ON public.medications_br;

CREATE POLICY "medications_br_select_authenticated"
    ON public.medications_br
    FOR SELECT
    TO authenticated
    USING (auth.role() = 'authenticated');

-- 5. Función RPC: public.search_medications_br
-- Realiza búsqueda rápida por EAN exacto o por similitud trigrama / coincidencia textual
CREATE OR REPLACE FUNCTION public.search_medications_br(
    search_query text,
    max_results int DEFAULT 20
)
RETURNS SETOF public.medications_br
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_clean text := trim(COALESCE(search_query, ''));
    v_limit int := LEAST(GREATEST(COALESCE(max_results, 20), 1), 100);
BEGIN
    -- Retorno vacío si el parámetro de búsqueda está vacío
    IF v_clean = '' THEN
        RETURN;
    END IF;

    -- 5.1 Búsqueda directa si es un código de barras numérico (EAN de 7 a 14 dígitos)
    IF v_clean ~ '^[0-9]{7,14}$' THEN
        RETURN QUERY
        SELECT *
        FROM public.medications_br
        WHERE ativo = true
          AND (ean = v_clean OR ean LIKE v_clean || '%')
        ORDER BY
            (ean = v_clean) DESC,
            nome_comercial ASC
        LIMIT v_limit;

        -- Si se encontraron coincidencias por código de barras, retornar inmediatamente
        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- 5.2 Búsqueda textual y trigrama en Nome Comercial y Substância (DCB)
    RETURN QUERY
    SELECT *
    FROM public.medications_br
    WHERE ativo = true
      AND (
          nome_comercial ILIKE '%' || v_clean || '%'
          OR substancia ILIKE '%' || v_clean || '%'
          OR nome_comercial % v_clean
          OR substancia % v_clean
          OR similarity(nome_comercial, v_clean) > 0.15
          OR similarity(substancia, v_clean) > 0.15
      )
    ORDER BY
        -- Prioridad 1: Coincidencia de prefijo exacto en nome_comercial
        (nome_comercial ILIKE v_clean || '%') DESC,
        -- Prioridad 2: Coincidencia de prefijo exacto en substancia
        (substancia ILIKE v_clean || '%') DESC,
        -- Prioridad 3: Substring exacto contenido
        (nome_comercial ILIKE '%' || v_clean || '%' OR substancia ILIKE '%' || v_clean || '%') DESC,
        -- Prioridad 4: Mayor similitud trigrama entre nome_comercial y substancia
        GREATEST(
            similarity(nome_comercial, v_clean),
            similarity(substancia, v_clean)
        ) DESC,
        -- Prioridad 5: Alfabético por nombre comercial
        nome_comercial ASC
    LIMIT v_limit;
END;
$$;

-- Permisos de ejecución de la función RPC
REVOKE ALL ON FUNCTION public.search_medications_br(text, int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_medications_br(text, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.search_medications_br(text, int) 
IS 'Búsqueda ultrarrápida en el vademécum CMED por código EAN o similitud trigrama en nombre y sustancia.';
