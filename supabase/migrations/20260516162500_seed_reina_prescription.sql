-- ============================================================================
-- Seed para generar a la paciente Reina y su receta médica
-- CUIR: AR-20260516-05F3A0E8
-- ============================================================================

DO $$
DECLARE
  -- Usamos el UUID de Eduardo configurado en seed_demo_doctor.sql
  v_doctor_user_id  UUID := '9a78cfb6-52cc-4edb-b935-864151f3b23d'; 
  v_doctor_id       UUID;
  
  -- UUIDs estáticos para Reina
  v_profile_reina   UUID := 'ee000008-0000-0000-0000-000000000008';
  v_patient_reina   UUID := 'dd000008-0000-0000-0000-000000000008';
  
  -- UUID para la receta
  v_prescription_id UUID := 'ff000001-0000-0000-0000-000000000001';
  v_cuir            TEXT := 'AR-20260516-05F3A0E8';
  
BEGIN
  -- 1. Resolver el ID interno de Eduardo como médico
  SELECT id INTO v_doctor_id FROM public.doctors WHERE user_id = v_doctor_user_id LIMIT 1;
  
  IF v_doctor_id IS NULL THEN
    RAISE NOTICE 'No se encontró al doctor Eduardo (UUID: %). Abortando.', v_doctor_user_id;
    RETURN;
  END IF;

  -- 2. Crear a Reina en auth.users no es estrictamente necesario para la demo interna
  -- pero sí necesitamos su Profile y Patient
  INSERT INTO public.profiles (id, email, role, first_name, last_name)
  VALUES (v_profile_reina, 'reina.demo@autamedica.com', 'patient', 'Reina', 'Demo')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Crear sus datos clínicos base
  INSERT INTO public.patients (id, user_id, dni, birth_date, gender, blood_type, height_cm, weight_kg, allergies, medications, active)
  VALUES (
    v_patient_reina, v_profile_reina, '12345678', '1950-01-01', 'female', 'A+', 160, 65,
    '[]'::jsonb, '[]'::jsonb, true
  ) ON CONFLICT (id) DO NOTHING;

  -- 4. Asociarla a tu lista de pacientes
  INSERT INTO public.doctor_patient (doctor_id, patient_id)
  VALUES (v_doctor_id, v_patient_reina)
  ON CONFLICT DO NOTHING;

  -- 5. Insertar la receta con el mismo código QR generado antes
  INSERT INTO public.prescriptions (
    id, doctor_id, patient_id, cuir, status, clinical_data, vendor_name, qr_code_content
  ) VALUES (
    v_prescription_id, v_doctor_id, v_patient_reina, v_cuir, 'signed',
    '{
      "diagnosis": "Cefalea tensional (G44.2)",
      "medication": {
        "genericName": "PARACETAMOL",
        "commercialName": "Tafirol",
        "dosage": "500mg",
        "presentation": "Comprimidos",
        "quantity": 16,
        "instructions": "Tomar 1 comprimido cada 8 horas por 5 días"
      },
      "issuedAt": "2026-05-16"
    }'::jsonb,
    'AutaMedica',
    'https://www.autamedica.com/verify/AR-20260516-05F3A0E8'
  ) ON CONFLICT (id) DO NOTHING;

  -- 6. Dejar el log de auditoría (Inmutable)
  INSERT INTO public.prescription_audit_events (
    prescription_id, event_type, user_id, ip_address, user_agent, signature_hash
  ) VALUES (
    v_prescription_id, 'prescription_signed', v_doctor_user_id, '127.0.0.1', 'AutaMedica Script Demo', 'hash-falso-lakaut-reina'
  );

  RAISE NOTICE '¡Éxito! Receta para Reina (CUIR: %) generada e insertada en base de datos.', v_cuir;
END $$;
