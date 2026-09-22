-- Migration: 20260922034500_real_on_duty_doctors_rpc.sql
-- Description: RPCs seguras para exponer médicos reales en guardia activa (elimina datos mock/hardcoded)
-- y corrige el error de anidamiento de agregados en get_duty_doctors_summary.

-- 1. RPC para listar médicos reales en guardia activa
CREATE OR REPLACE FUNCTION public.get_active_on_duty_doctors()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'name', CASE 
                WHEN TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) <> '' 
                THEN 'Dr. ' || TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''))
                ELSE 'Dr. Médico de Guardia'
            END,
            'short_name', CASE
                WHEN COALESCE(p.last_name, '') <> '' THEN 'Dr. ' || p.last_name
                WHEN COALESCE(p.first_name, '') <> '' THEN 'Dr. ' || p.first_name
                ELSE 'Dr. de Guardia'
            END,
            'specialty', COALESCE(d.specialty, 'Medicina General'),
            'initials', UPPER(
                COALESCE(NULLIF(SUBSTRING(p.first_name, 1, 1), ''), 'M') || 
                COALESCE(NULLIF(SUBSTRING(p.last_name, 1, 1), ''), 'G')
            ),
            'status_text', CASE 
                WHEN dds.current_active_request_id IS NULL THEN 'En línea' 
                ELSE 'En consulta' 
            END,
            'is_available', (dds.current_active_request_id IS NULL),
            'registration', TRIM(COALESCE(d.license_type, 'MN') || ' ' || COALESCE(d.license_number, ''))
        )
    ) INTO v_result
    FROM public.doctor_duty_status dds
    JOIN public.doctors d ON d.id = dds.doctor_id
    LEFT JOIN public.profiles p ON p.user_id = d.user_id
    WHERE dds.is_on_duty = true;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 2. Corrección de get_duty_doctors_summary (eliminando nested aggregate con CTE)
CREATE OR REPLACE FUNCTION public.get_duty_doctors_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH unnested_tiers AS (
        SELECT unnest(active_tiers) AS tier, current_active_request_id
        FROM public.doctor_duty_status
        WHERE is_on_duty = true 
    ),
    grouped_counts AS (
        SELECT 
            tier,
            count(*)::int AS online_count,
            count(*) FILTER (WHERE current_active_request_id IS NULL)::int AS free_count
        FROM unnested_tiers
        GROUP BY tier
    )
    SELECT jsonb_object_agg(
        tier,
        jsonb_build_object(
            'online_count', online_count,
            'free_count', free_count
        )
    ) INTO v_result
    FROM grouped_counts;

    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- 3. Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION public.get_active_on_duty_doctors() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_duty_doctors_summary() TO authenticated, anon;
