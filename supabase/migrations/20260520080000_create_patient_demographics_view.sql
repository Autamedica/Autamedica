-- Migration: Create Patient Demographics View
-- Purpose: Support real-time population analytics by aggregating patients by gender, age groups, region, and insurance coverage.

CREATE OR REPLACE VIEW public.v_patient_demographics AS
WITH patient_ages AS (
  SELECT 
    id,
    gender,
    birth_date,
    EXTRACT(YEAR FROM AGE(birth_date))::integer AS age,
    address,
    insurance_info
  FROM public.patients
  WHERE active = true
),
age_groups AS (
  SELECT 
    gender,
    CASE 
      WHEN age IS NULL THEN 'Desconocido'
      WHEN age < 18 THEN 'Menores de 18'
      WHEN age BETWEEN 18 AND 29 THEN '18 a 29'
      WHEN age BETWEEN 30 AND 49 THEN '30 a 49'
      WHEN age BETWEEN 50 AND 69 THEN '50 a 69'
      ELSE '70 o más'
    END AS age_group,
    CASE 
      WHEN lower(address) LIKE '%caba%' OR lower(address) LIKE '%capital%' THEN 'CABA'
      WHEN lower(address) LIKE '%buenos aires%' OR lower(address) LIKE '%provincia%' OR lower(address) LIKE '%gba%' THEN 'Buenos Aires'
      WHEN lower(address) LIKE '%córdoba%' OR lower(address) LIKE '%cordoba%' THEN 'Córdoba'
      WHEN lower(address) LIKE '%santa fe%' OR lower(address) LIKE '%rosario%' THEN 'Santa Fe'
      WHEN address IS NULL OR address = '' THEN 'Sin especificar'
      ELSE 'Otras provincias'
    END AS region,
    CASE 
      WHEN insurance_info->>'name' IS NOT NULL THEN insurance_info->>'name'
      WHEN insurance_info->>'obra_social' IS NOT NULL THEN insurance_info->>'obra_social'
      WHEN insurance_info->>'plan' IS NOT NULL THEN insurance_info->>'plan'
      ELSE 'Particular / Sin Obra Social'
    END AS insurance_name
  FROM patient_ages
)
SELECT 
  (SELECT count(*) FROM public.patients WHERE active = true) AS total_active_patients,
  coalesce(gender, 'prefer_not_to_say') as gender,
  age_group,
  region,
  insurance_name,
  count(*) as count
FROM age_groups
GROUP BY gender, age_group, region, insurance_name;

-- Assign permissions
ALTER VIEW public.v_patient_demographics OWNER TO postgres;
GRANT SELECT ON public.v_patient_demographics TO authenticated;
GRANT SELECT ON public.v_patient_demographics TO service_role;

COMMENT ON VIEW public.v_patient_demographics IS 'Vista agregada en tiempo real para demografía de pacientes sin exponer datos personales.';
