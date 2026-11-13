-- AUDIT RECONSTRUCTION - restored from production Supabase migration ledger.
-- Version: 20260926150000; name: regulatory_separation_crm_rs_ondemand_dispatch.
-- Draft only. Must be tested on a FULL clean staging schema before merge.
-- PRIVACY: excluded three historical targeted test-user profile updates (statements 8-10).
-- This file preserves the schema/routine changes, not personally identifying test seeds.

-- Migration: 20260926150000_regulatory_separation_crm_rs_ondemand_dispatch.sql
-- Description: Separación regulatoria Brasil (CRM) y Argentina (MN/MP) en el motor OnDemand
--              1. Agrega license_jurisdiction a doctors y doctor_licenses
--              2. Modifica match_dispatch_doctors para exigir estrictamente matrícula brasileña CRM
--                 (d.license_type = 'CRM' AND (d.uf_brazil IS NOT NULL OR d.license_jurisdiction = 'RS'))
--                 en solicitudes de Brasil (BRL / farmacias BR).
--              3. Configura el perfil de prueba del Dr. Eduardo Marques con CRM-RS MP006402.

-- 1. Agregar columna license_jurisdiction para compatibilidad plena
ALTER TABLE public.doctors 
  ADD COLUMN IF NOT EXISTS license_jurisdiction TEXT;

UPDATE public.doctors
SET license_jurisdiction = COALESCE(license_jurisdiction, uf_brazil, enrollment_jurisdiction)
WHERE license_jurisdiction IS NULL;

ALTER TABLE public.doctor_licenses 
  ADD COLUMN IF NOT EXISTS license_jurisdiction TEXT;

UPDATE public.doctor_licenses
SET license_jurisdiction = COALESCE(license_jurisdiction, uf_brazil, province)
WHERE license_jurisdiction IS NULL;

-- 2. Actualizar match_dispatch_doctors con separación regulatoria estricta
CREATE OR REPLACE FUNCTION public.match_dispatch_doctors(p_dispatch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req public.pharmacy_dispatch_requests%ROWTYPE;
  v_tier_key TEXT;
  v_doctor_fee NUMERIC(6,2);
  v_pvp_price NUMERIC(6,2);
  v_result JSONB;
  v_is_brazil BOOLEAN := false;
  v_pharmacy_country TEXT;
  v_pharmacy_province TEXT;
BEGIN
  -- 1. Obtener datos de la solicitud de despacho
  SELECT * INTO v_req 
  FROM public.pharmacy_dispatch_requests 
  WHERE id = p_dispatch_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'dispatch_request_not_found');
  END IF;

  -- 2. Clasificar según tier_requested y resolver Repasse exacto al médico y PVP canónico
  CASE 
    WHEN v_req.tier_requested IN ('salud_mental') THEN
      v_tier_key := 'tier_4';
      v_doctor_fee := 140.00;
      v_pvp_price := 219.00;

    WHEN v_req.tier_requested IN (
      'cardiologia', 'dermatologia', 'traumatologia', 'endocrinologia',
      'oftalmo_otorrino', 'neumonologia', 'gastroenterologia', 'urologia'
    ) THEN
      v_tier_key := 'tier_3';
      v_doctor_fee := 100.00;
      v_pvp_price := 159.00;

    WHEN v_req.tier_requested IN ('pediatria', 'salud_femenina') THEN
      v_tier_key := 'tier_2';
      v_doctor_fee := 75.00;
      v_pvp_price := 119.00;

    ELSE
      v_tier_key := 'tier_1';
      v_doctor_fee := 50.00;
      v_pvp_price := 79.00;
  END CASE;

  -- 3. Obtener valores actualizados desde ondemand_pricing si están presentes
  SELECT 
    COALESCE(doctor_fee_brl, v_doctor_fee),
    COALESCE(price_brl, v_pvp_price)
  INTO v_doctor_fee, v_pvp_price
  FROM public.ondemand_pricing 
  WHERE tier = v_tier_key;

  -- 4. Asegurar que pharmacy_dispatch_requests registre PVP (price_brl) y Repasse (doctor_fee_brl)
  UPDATE public.pharmacy_dispatch_requests
  SET 
    price_brl = COALESCE(price_brl, v_pvp_price),
    doctor_fee_brl = COALESCE(doctor_fee_brl, v_doctor_fee),
    updated_at = NOW()
  WHERE id = p_dispatch_id
    AND (price_brl IS NULL OR doctor_fee_brl IS NULL);

  -- 5. Determinar jurisdicción regulatoria (Brasil vs Argentina):
  -- Las solicitudes de farmacia que operan en Brasil (o con moneda BRL / farmacias de Brasil)
  -- DEBEN exigir estrictamente médicos con matrícula brasileña CRM.
  IF v_req.pharmacy_id IS NOT NULL THEN
    SELECT 
      ph.address->>'country',
      ph.address->>'province'
    INTO v_pharmacy_country, v_pharmacy_province
    FROM public.pharmacies ph
    WHERE ph.id = v_req.pharmacy_id;
  END IF;

  -- Si la farmacia está explícitamente en Argentina sin CPF de paciente, se trata como solicitud argentina.
  IF (v_pharmacy_country ILIKE '%AR%' OR v_pharmacy_province ILIKE ANY(ARRAY['%Buenos Aires%', '%CABA%', '%Capital Federal%', '%Cordoba%', '%Córdoba%', '%Santa Fe%', '%Mendoza%']))
     AND v_req.patient_cpf IS NULL THEN
    v_is_brazil := false;
  ELSE
    -- En cualquier otro caso (moneda BRL, patient_cpf, farmacia en RS/Brasil o sin farmacia específica):
    -- Opera bajo regulación brasileña
    v_is_brazil := true;
  END IF;

  -- 6. Limpiar ofertas previas expiradas para este dispatch
  DELETE FROM public.dispatch_offers 
  WHERE dispatch_request_id = p_dispatch_id 
    AND status = 'expired';
  
  -- 7. Buscar médicos on-duty con heartbeat reciente (> now() - 90s), disponibles y compatibles
  -- Guardar en dispatch_offers.price_brl el repasse exacto al médico (v_doctor_fee)
  WITH inserted AS (
    INSERT INTO public.dispatch_offers (
      dispatch_request_id,
      doctor_id,
      offered_at,
      expires_at,
      status,
      price_brl
    )
    SELECT 
      p_dispatch_id,
      d.id,
      NOW(),
      NOW() + INTERVAL '30 seconds',
      'pending',
      v_doctor_fee
    FROM public.doctors d
    JOIN public.doctor_duty_status dds ON dds.doctor_id = d.id
    WHERE (d.on_duty_pharmacy = true OR dds.is_on_duty = true)
      AND dds.last_heartbeat_at > NOW() - INTERVAL '90 seconds'
      AND dds.current_active_request_id IS NULL
      AND (
        dds.active_tiers IS NULL 
        OR v_req.tier_requested = ANY(dds.active_tiers)
        OR 'general'::public.dispatch_tier_category = ANY(dds.active_tiers)
      )
      -- SEPARACIÓN REGULATORIA BRASIL (CRM) VS ARGENTINA (MN/MP):
      AND (
        CASE 
          WHEN v_is_brazil THEN
            d.license_type = 'CRM' 
            AND (d.uf_brazil IS NOT NULL OR d.license_jurisdiction = 'RS')
            AND d.license_type NOT IN ('MN', 'MP')
          ELSE
            d.license_type IN ('MN', 'MP')
            AND (d.license_type != 'CRM' OR d.license_type IS NULL)
        END
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.dispatch_offers doe
        WHERE doe.dispatch_request_id = p_dispatch_id
          AND doe.doctor_id = d.id
          AND doe.status = 'pending'
      )
    RETURNING id, doctor_id, offered_at, expires_at, status, price_brl
  )
  SELECT jsonb_build_object(
    'offers',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id::text,
          'doctor_id', doctor_id::text,
          'offered_at', offered_at,
          'expires_at', expires_at,
          'status', status,
          'price_brl', price_brl
        )
      ),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM inserted;
  
  IF v_result IS NULL OR (v_result->'offers') IS NULL OR jsonb_array_length(v_result->'offers') = 0 THEN
    RETURN '{}'::jsonb;
  END IF;
  
  RETURN v_result;
END;
$$;

-- Permisos de seguridad para match_dispatch_doctors
REVOKE EXECUTE ON FUNCTION public.match_dispatch_doctors(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.match_dispatch_doctors(UUID) TO authenticated, service_role;
