-- Seed del catálogo de screenings preventivos
INSERT INTO public.preventive_screenings 
(id, name, category, description, target_gender, min_age, max_age, recommended_frequency, is_mandatory)
VALUES
('b100d000-0000-4000-a000-000000000001', 'Control de Presión Arterial', 'cardiovascular', 'Medición de la presión arterial para detectar hipertensión.', 'all', 18, NULL, 'annually', true),
('b100d000-0000-4000-a000-000000000002', 'Análisis de Glucemia', 'metabolic', 'Medición de azúcar en sangre para detectar diabetes.', 'all', 45, NULL, 'every_3_years', true),
('b100d000-0000-4000-a000-000000000003', 'Perfil Lipídico (Colesterol)', 'metabolic', 'Análisis de colesterol y triglicéridos.', 'all', 35, NULL, 'every_5_years', false),
('b100d000-0000-4000-a000-000000000004', 'Papanicolaou (PAP)', 'cancer_screening', 'Estudio para detectar cáncer de cuello uterino.', 'female', 25, 64, 'every_3_years', true),
('b100d000-0000-4000-a000-000000000005', 'Test de VPH', 'cancer_screening', 'Detección del Virus del Papiloma Humano.', 'female', 30, 64, 'every_5_years', true),
('b100d000-0000-4000-a000-000000000006', 'Mamografía', 'cancer_screening', 'Radiografía de mamas para detectar cáncer de mama.', 'female', 50, 69, 'every_2_years', true),
('b100d000-0000-4000-a000-000000000007', 'Colonoscopia', 'cancer_screening', 'Estudio del colon para detectar cáncer colorrectal.', 'all', 50, 75, 'every_10_years', true),
('b100d000-0000-4000-a000-000000000008', 'PSA (Antígeno Prostático)', 'cancer_screening', 'Análisis de sangre para detectar cáncer de próstata.', 'male', 50, 75, 'annually', true),
('b100d000-0000-4000-a000-000000000009', 'Densitometría Ósea', 'bone_health', 'Medición de densidad ósea para detectar osteoporosis.', 'female', 65, NULL, 'every_2_years', false),
('b100d000-0000-4000-a000-000000000010', 'Control Odontológico', 'dental', 'Revisión dental y limpieza semestral.', 'all', 6, NULL, 'every_6_months', false)
ON CONFLICT (id) DO NOTHING;
