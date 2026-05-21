 WITH patient_ages AS (
         SELECT patients.id,
            patients.gender,
            patients.birth_date,
            (EXTRACT(year FROM age((patients.birth_date)::timestamp with time zone)))::integer AS age,
            patients.address,
            patients.insurance_info
           FROM patients
          WHERE (patients.active = true)
        ), age_groups AS (
         SELECT patient_ages.gender,
                CASE
                    WHEN (patient_ages.age IS NULL) THEN 'Desconocido'::text
                    WHEN (patient_ages.age < 18) THEN 'Menores de 18'::text
                    WHEN ((patient_ages.age >= 18) AND (patient_ages.age <= 29)) THEN '18 a 29'::text
                    WHEN ((patient_ages.age >= 30) AND (patient_ages.age <= 49)) THEN '30 a 49'::text
                    WHEN ((patient_ages.age >= 50) AND (patient_ages.age <= 69)) THEN '50 a 69'::text
                    ELSE '70 o más'::text
                END AS age_group,
                CASE
                    WHEN ((lower(patient_ages.address) ~~ '%caba%'::text) OR (lower(patient_ages.address) ~~ '%capital%'::text)) THEN 'CABA'::text
                    WHEN ((lower(patient_ages.address) ~~ '%buenos aires%'::text) OR (lower(patient_ages.address) ~~ '%provincia%'::text) OR (lower(patient_ages.address) ~~ '%gba%'::text)) THEN 'Buenos Aires'::text
                    WHEN ((lower(patient_ages.address) ~~ '%córdoba%'::text) OR (lower(patient_ages.address) ~~ '%cordoba%'::text)) THEN 'Córdoba'::text
                    WHEN ((lower(patient_ages.address) ~~ '%santa fe%'::text) OR (lower(patient_ages.address) ~~ '%rosario%'::text)) THEN 'Santa Fe'::text
                    WHEN ((patient_ages.address IS NULL) OR (patient_ages.address = ''::text)) THEN 'Sin especificar'::text
                    ELSE 'Otras provincias'::text
                END AS region,
                CASE
                    WHEN ((patient_ages.insurance_info ->> 'name'::text) IS NOT NULL) THEN (patient_ages.insurance_info ->> 'name'::text)
                    WHEN ((patient_ages.insurance_info ->> 'obra_social'::text) IS NOT NULL) THEN (patient_ages.insurance_info ->> 'obra_social'::text)
                    WHEN ((patient_ages.insurance_info ->> 'plan'::text) IS NOT NULL) THEN (patient_ages.insurance_info ->> 'plan'::text)
                    ELSE 'Particular / Sin Obra Social'::text
                END AS insurance_name
           FROM patient_ages
        )
 SELECT ( SELECT count(*) AS count
           FROM patients
          WHERE (patients.active = true)) AS total_active_patients,
    COALESCE(gender, 'prefer_not_to_say'::text) AS gender,
    age_group,
    region,
    insurance_name,
    count(*) AS count
   FROM age_groups
  GROUP BY gender, age_group, region, insurance_name;