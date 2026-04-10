-- ============================================================================
-- Demo Seed: Doctor Portal — doctor.demo@autamedica.com
--
-- Propósito: poblar el portal del médico con datos realistas para demos.
-- El usuario doctor ya existe en auth.users y profiles con role='doctor'.
-- Este script es idempotente (ON CONFLICT DO NOTHING en toda inserción).
--
-- Ejecutar con service_role para bypassear RLS.
-- ============================================================================

DO $$
DECLARE
  -- Doctor demo (usuario ya existente en prod/staging)
  v_doctor_user_id  UUID := '9a78cfb6-52cc-4edb-b935-864151f3b23d';
  v_doctor_id       UUID;

  -- UUIDs de pacientes demo (nuevos, no colisionan con seed_data.sql)
  v_patient_1       UUID := 'dd000001-0000-0000-0000-000000000001'; -- Tomás Herrera (TDAH continuidad)
  v_patient_2       UUID := 'dd000002-0000-0000-0000-000000000002'; -- Valentina Sosa (primera consulta)
  v_patient_3       UUID := 'dd000003-0000-0000-0000-000000000003'; -- Rodrigo Peralta (seguimiento ansiedad)
  v_patient_4       UUID := 'dd000004-0000-0000-0000-000000000004'; -- Lucía Méndez (depresión bipolar)
  v_patient_5       UUID := 'dd000005-0000-0000-0000-000000000005'; -- Federico Castillo (TDAH adulto)
  v_patient_6       UUID := 'dd000006-0000-0000-0000-000000000006'; -- Martina Vidal (trastorno sueño)
  v_patient_7       UUID := 'dd000007-0000-0000-0000-000000000007'; -- Santiago Romero (TOC)

  -- UUIDs de profiles para los pacientes
  v_profile_1       UUID := 'ee000001-0000-0000-0000-000000000001';
  v_profile_2       UUID := 'ee000002-0000-0000-0000-000000000002';
  v_profile_3       UUID := 'ee000003-0000-0000-0000-000000000003';
  v_profile_4       UUID := 'ee000004-0000-0000-0000-000000000004';
  v_profile_5       UUID := 'ee000005-0000-0000-0000-000000000005';
  v_profile_6       UUID := 'ee000006-0000-0000-0000-000000000006';
  v_profile_7       UUID := 'ee000007-0000-0000-0000-000000000007';

  -- UUIDs de turnos
  v_appt_today_1    UUID := 'aa000001-0000-0000-0000-000000000001';
  v_appt_today_2    UUID := 'aa000002-0000-0000-0000-000000000002';
  v_appt_today_3    UUID := 'aa000003-0000-0000-0000-000000000003';
  v_appt_week_1     UUID := 'aa000004-0000-0000-0000-000000000004';
  v_appt_week_2     UUID := 'aa000005-0000-0000-0000-000000000005';
  v_appt_past_1     UUID := 'aa000006-0000-0000-0000-000000000006';
  v_appt_past_2     UUID := 'aa000007-0000-0000-0000-000000000007';

  -- UUIDs de intakes psiquiátricos
  v_intake_1        UUID := 'ii000001-0000-0000-0000-000000000001'; -- Tomás: TDAH continuidad
  v_intake_2        UUID := 'ii000002-0000-0000-0000-000000000002'; -- Valentina: primera visita

  -- UUIDs de clinical case states
  v_case_1          UUID := 'cc000001-0000-0000-0000-000000000001'; -- Rodrigo: urgente, triage priority

BEGIN

  -- ── Resolver el id del doctor desde user_id ───────────────────────────────
  SELECT id INTO v_doctor_id
  FROM public.doctors
  WHERE user_id = v_doctor_user_id
  LIMIT 1;

  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Doctor no encontrado para user_id %. Verificar que el doctor demo existe.', v_doctor_user_id;
  END IF;

  RAISE NOTICE 'Doctor demo encontrado: %', v_doctor_id;

  -- ==========================================================================
  -- PROFILES (identidad de los pacientes)
  -- ==========================================================================

  INSERT INTO public.profiles (id, email, role, first_name, last_name)
  VALUES
    (v_profile_1, 'tomas.herrera.demo@mail.com',    'patient', 'Tomás',    'Herrera'),
    (v_profile_2, 'valentina.sosa.demo@mail.com',   'patient', 'Valentina','Sosa'),
    (v_profile_3, 'rodrigo.peralta.demo@mail.com',  'patient', 'Rodrigo',  'Peralta'),
    (v_profile_4, 'lucia.mendez.demo@mail.com',     'patient', 'Lucía',    'Méndez'),
    (v_profile_5, 'federico.castillo.demo@mail.com','patient', 'Federico', 'Castillo'),
    (v_profile_6, 'martina.vidal.demo@mail.com',    'patient', 'Martina',  'Vidal'),
    (v_profile_7, 'santiago.romero.demo@mail.com',  'patient', 'Santiago', 'Romero')
  ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- PATIENTS (extensión médica de cada perfil)
  -- ==========================================================================

  INSERT INTO public.patients (id, user_id, dni, birth_date, gender, blood_type, height_cm, weight_kg, allergies, medications, active)
  VALUES
    (
      v_patient_1, v_profile_1,
      '32451789', '1991-04-07', 'male', 'O+', 178, 74.5,
      '[]'::jsonb,
      '[{"name":"metilfenidato","dose":"36mg","frequency":"mañana","since":"2023-03"},{"name":"clonazepam","dose":"0.5mg","frequency":"noche","since":"2023-06"}]'::jsonb,
      true
    ),
    (
      v_patient_2, v_profile_2,
      '40122534', '1999-11-22', 'female', 'A+', 163, 58.0,
      '[{"allergen":"penicilina","reaction":"urticaria","severity":"moderate"}]'::jsonb,
      '[]'::jsonb,
      true
    ),
    (
      v_patient_3, v_profile_3,
      '35678901', '1989-08-15', 'male', 'B-', 175, 82.0,
      '[]'::jsonb,
      '[{"name":"sertralina","dose":"100mg","frequency":"mañana","since":"2024-01"},{"name":"alprazolam","dose":"0.25mg","frequency":"según necesidad","since":"2024-01"}]'::jsonb,
      true
    ),
    (
      v_patient_4, v_profile_4,
      '38901234', '1995-02-28', 'female', 'AB+', 160, 62.5,
      '[]'::jsonb,
      '[{"name":"lamotrigina","dose":"200mg","frequency":"noche","since":"2022-09"},{"name":"quetiapina","dose":"50mg","frequency":"noche","since":"2022-09"}]'::jsonb,
      true
    ),
    (
      v_patient_5, v_profile_5,
      '30891234', '1984-06-10', 'male', 'O-', 180, 88.0,
      '[{"allergen":"ibuprofeno","reaction":"gastritis","severity":"mild"}]'::jsonb,
      '[{"name":"metilfenidato LA","dose":"54mg","frequency":"mañana","since":"2021-05"},{"name":"atomoxetina","dose":"40mg","frequency":"mañana","since":"2023-11"}]'::jsonb,
      true
    ),
    (
      v_patient_6, v_profile_6,
      '42356789', '2001-09-03', 'female', 'A-', 168, 55.0,
      '[]'::jsonb,
      '[{"name":"melatonina","dose":"5mg","frequency":"antes de dormir","since":"2025-01"}]'::jsonb,
      true
    ),
    (
      v_patient_7, v_profile_7,
      '37123456', '1993-12-19', 'male', 'B+', 172, 70.0,
      '[]'::jsonb,
      '[{"name":"fluoxetina","dose":"20mg","frequency":"mañana","since":"2024-06"},{"name":"clonazepam","dose":"1mg","frequency":"noche","since":"2024-06"}]'::jsonb,
      true
    )
  ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- DOCTOR_PATIENT (asignación directa médico-paciente)
  -- ==========================================================================

  INSERT INTO public.doctor_patient (doctor_id, patient_id)
  VALUES
    (v_doctor_id, v_patient_1),
    (v_doctor_id, v_patient_2),
    (v_doctor_id, v_patient_3),
    (v_doctor_id, v_patient_4),
    (v_doctor_id, v_patient_5),
    (v_doctor_id, v_patient_6),
    (v_doctor_id, v_patient_7)
  ON CONFLICT DO NOTHING;

  -- ==========================================================================
  -- APPOINTMENTS — HOY (relativo a CURRENT_DATE para que el seed se mantenga fresco)
  -- ==========================================================================

  -- Turno 1: Tomás Herrera — control TDAH, confirmed, en ~1 hora
  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, duration_minutes, type, status, notes, created_by)
  VALUES (
    v_appt_today_1,
    v_patient_1,
    v_doctor_id,
    (CURRENT_DATE + INTERVAL '10 hours')::timestamptz,
    45,
    'follow_up',
    'confirmed',
    'Control mensual TDAH. Evaluar eficacia de metilfenidato 36mg. Paciente refiere mejora en concentración laboral pero dificultad para dormir.',
    v_doctor_user_id
  ) ON CONFLICT (id) DO NOTHING;

  -- Turno 2: Valentina Sosa — primera consulta, scheduled, en ~3 horas
  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, duration_minutes, type, status, notes, created_by)
  VALUES (
    v_appt_today_2,
    v_patient_2,
    v_doctor_id,
    (CURRENT_DATE + INTERVAL '12 hours')::timestamptz,
    60,
    'consultation',
    'scheduled',
    'Primera consulta. Derivada por médico clínico por síntomas compatibles con TDAH y ansiedad generalizada. Trae estudios previos.',
    v_doctor_user_id
  ) ON CONFLICT (id) DO NOTHING;

  -- Turno 3: Rodrigo Peralta — control ansiedad, confirmed, tarde
  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, duration_minutes, type, status, notes, created_by)
  VALUES (
    v_appt_today_3,
    v_patient_3,
    v_doctor_id,
    (CURRENT_DATE + INTERVAL '15 hours')::timestamptz,
    30,
    'follow_up',
    'confirmed',
    'Seguimiento trastorno de ansiedad. Revisar adherencia a sertralina. Paciente reportó episodio de pánico la semana pasada.',
    v_doctor_user_id
  ) ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- APPOINTMENTS — ESTA SEMANA
  -- ==========================================================================

  -- Turno esta semana: Lucía Méndez — control bipolar
  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, duration_minutes, type, status, notes, created_by)
  VALUES (
    v_appt_week_1,
    v_patient_4,
    v_doctor_id,
    (CURRENT_DATE + INTERVAL '2 days' + INTERVAL '9 hours')::timestamptz,
    45,
    'follow_up',
    'confirmed',
    'Control trastorno bipolar tipo II. Evaluar estado de ánimo, sueño y funcionamiento social. Litemia pendiente de laboratorio.',
    v_doctor_user_id
  ) ON CONFLICT (id) DO NOTHING;

  -- Turno esta semana: Federico Castillo — ajuste de dosis TDAH adulto
  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, duration_minutes, type, status, notes, created_by)
  VALUES (
    v_appt_week_2,
    v_patient_5,
    v_doctor_id,
    (CURRENT_DATE + INTERVAL '4 days' + INTERVAL '11 hours')::timestamptz,
    30,
    'follow_up',
    'scheduled',
    'Ajuste de dosis. Paciente refiere que atomoxetina 40mg ya no es suficiente. Evaluación de cambio a 80mg o combinación.',
    v_doctor_user_id
  ) ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- APPOINTMENTS — COMPLETADOS (historia)
  -- ==========================================================================

  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, duration_minutes, type, status, notes, created_by)
  VALUES (
    v_appt_past_1,
    v_patient_1,
    v_doctor_id,
    (CURRENT_DATE - INTERVAL '30 days' + INTERVAL '10 hours')::timestamptz,
    45,
    'follow_up',
    'completed',
    'Control TDAH mensual. Buena respuesta al metilfenidato. Se agregó clonazepam 0.5mg noche por insomnio de rebote.',
    v_doctor_user_id
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.appointments (id, patient_id, doctor_id, start_time, duration_minutes, type, status, notes, created_by)
  VALUES (
    v_appt_past_2,
    v_patient_3,
    v_doctor_id,
    (CURRENT_DATE - INTERVAL '14 days' + INTERVAL '14 hours')::timestamptz,
    30,
    'follow_up',
    'completed',
    'Seguimiento ansiedad. Dosis de sertralina aumentada de 50mg a 100mg. Psicoeducación sobre manejo del pánico.',
    v_doctor_user_id
  ) ON CONFLICT (id) DO NOTHING;

  -- ==========================================================================
  -- PSYCHIATRY INTAKES
  -- ==========================================================================

  -- ── Intake 1: Tomás Herrera — TDAH continuidad (completado, locked) ────────
  INSERT INTO public.psychiatry_intakes (
    id, patient_id, status, treatment_context, completion_percentage,
    last_phase, sections_status, locked, privacy_accepted, terms_accepted, completed_at
  ) VALUES (
    v_intake_1,
    v_patient_1,
    'approved',
    'tdah_stimulants',
    100,
    'completed',
    '{
      "consulta_actual":           {"completed": true, "phase": "wizard_intake"},
      "diagnostico_y_tratamiento": {"completed": true, "phase": "wizard_intake"},
      "contexto_personal":         {"completed": true, "phase": "wizard_intake"},
      "historia_sintomas":         {"completed": true, "phase": "conversational_symptoms"},
      "impacto_funcional":         {"completed": true, "phase": "conversational_symptoms"},
      "respuesta_previa":          {"completed": true, "phase": "conversational_symptoms"},
      "seguridad_clinica":         {"completed": true, "phase": "wizard_safety"},
      "antecedentes_mentales":     {"completed": true, "phase": "wizard_safety"},
      "contraindicaciones_medicas":{"completed": true, "phase": "wizard_safety"},
      "monitoreo_tratamiento":     {"completed": true, "phase": "conversational_closure"},
      "objetivos_terapeuticos":    {"completed": true, "phase": "conversational_closure"},
      "aclaraciones_finales":      {"completed": true, "phase": "conversational_closure"}
    }'::jsonb,
    true,
    true,
    true,
    NOW() - INTERVAL '25 days'
  ) ON CONFLICT (patient_id) DO NOTHING;

  -- Secciones del intake 1
  INSERT INTO public.psychiatry_intake_sections (intake_id, section, phase, data, completed, completed_at)
  VALUES
    (
      v_intake_1, 'consulta_actual', 'wizard_intake',
      '{
        "motivo_consulta": "Control mensual TDAH. Tratamiento en curso con metilfenidato.",
        "tiempo_sintomas": "más de 2 años",
        "tipo_consulta": "continuidad"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'diagnostico_y_tratamiento', 'wizard_intake',
      '{
        "diagnostico_previo": "TDAH tipo combinado (F90.0)",
        "medicacion_actual": [
          {"nombre": "metilfenidato", "dosis": "36mg", "frecuencia": "mañana", "desde": "2023-03"},
          {"nombre": "clonazepam",    "dosis": "0.5mg","frecuencia": "noche",  "desde": "2023-06"}
        ],
        "adherencia": "buena",
        "medico_anterior": "Dra. Fernández (consulta privada)",
        "psicoterapia_actual": true,
        "tipo_psicoterapia": "TCC — sesiones quincenales"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'contexto_personal', 'wizard_intake',
      '{
        "ocupacion": "Desarrollador de software (trabajo remoto)",
        "situacion_laboral": "empleado_tiempo_completo",
        "situacion_familiar": "en pareja sin hijos",
        "nivel_educativo": "universitario_completo",
        "red_apoyo": "pareja y amigos cercanos"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'historia_sintomas', 'conversational_symptoms',
      '{
        "descripcion": "Desde que empecé a trabajar remoto la falta de estructura externa hizo que los síntomas de desatención volvieran a ser más evidentes. Me cuesta sostener el foco en tareas largas y procrastino mucho. Con el metilfenidato noto que las mañanas son productivas pero por la tarde decae bastante.",
        "patron_horario": "mañana funciono bien, después de las 17 empieza la dificultad",
        "factor_desencadenante": "trabajo remoto sin estructura",
        "sintomas_predominantes": ["desatención", "procrastinación", "dificultad para iniciar tareas", "insomnio de rebote"]
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'impacto_funcional', 'conversational_symptoms',
      '{
        "impacto_laboral": "moderado — entrego tareas tarde, dificultad para reuniones largas",
        "impacto_social": "leve — a veces me distraigo en conversaciones",
        "impacto_familiar": "leve — mi pareja nota que soy más irritable por la noche",
        "impacto_autocuidado": "ninguno"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'respuesta_previa', 'conversational_symptoms',
      '{
        "respuesta_actual": "buena — metilfenidato funciona bien en la mañana",
        "efectos_adversos": "insomnio de rebote (por eso se agregó clonazepam), leve pérdida de apetito al mediodía",
        "tratamientos_previos": [
          {"medicacion": "metilfenidato 18mg", "resultado": "insuficiente, se aumentó a 36mg"},
          {"medicacion": "anfetaminas", "resultado": "no toleradas, taquicardia"}
        ]
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'seguridad_clinica', 'wizard_safety',
      '{
        "ideacion_suicida": false,
        "autolesiones": false,
        "consumo_sustancias": "alcohol ocasional (fines de semana), sin abuso",
        "riesgo_actual": "ninguno"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'antecedentes_mentales', 'wizard_safety',
      '{
        "internaciones_psiquiatricas": false,
        "intentos_suicidio": false,
        "episodios_maniacos": false,
        "antecedentes_familiares": "padre con diagnóstico de TDAH, hermano con depresión"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'contraindicaciones_medicas', 'wizard_safety',
      '{
        "enfermedades_cardiovasculares": false,
        "hipertension": false,
        "epilepsia": false,
        "glaucoma": false,
        "embarazo": false,
        "alergias_medicamentos": "ninguna conocida"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'monitoreo_tratamiento', 'conversational_closure',
      '{
        "frecuencia_control": "mensual",
        "parametros_monitoreo": ["tensión arterial", "peso", "calidad de sueño", "rendimiento laboral"],
        "ultimo_ECG": "2023-08 — normal",
        "ultima_TA": "118/76 mmHg"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'objetivos_terapeuticos', 'conversational_closure',
      '{
        "objetivos_paciente": "Mejorar la productividad laboral en el horario de la tarde. Reducir procrastinación. Dormir mejor.",
        "objetivo_medico": "Evaluar si conviene agregar una dosis vespertina menor de metilfenidato o cambiar a formulación OROS.",
        "plazo": "3 meses"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    ),
    (
      v_intake_1, 'aclaraciones_finales', 'conversational_closure',
      '{
        "dudas_paciente": "¿Puedo tomar café con el metilfenidato? ¿Es normal que por la tarde me sienta más ansioso?",
        "indicaciones_finales": "Sí al café con moderación. La ansiedad vespertina puede ser rebote — evaluamos en próximo control.",
        "proxima_cita": "control en 30 días"
      }'::jsonb,
      true, NOW() - INTERVAL '25 days'
    )
  ON CONFLICT (intake_id, section) DO NOTHING;

  -- ── Intake 2: Valentina Sosa — primera visita (completado, en revisión) ───

  INSERT INTO public.psychiatry_intakes (
    id, patient_id, status, treatment_context, completion_percentage,
    last_phase, sections_status, locked, privacy_accepted, terms_accepted, completed_at
  ) VALUES (
    v_intake_2,
    v_patient_2,
    'completed',
    'tdah_stimulants',
    100,
    'completed',
    '{
      "consulta_actual":           {"completed": true, "phase": "wizard_intake"},
      "diagnostico_y_tratamiento": {"completed": true, "phase": "wizard_intake"},
      "contexto_personal":         {"completed": true, "phase": "wizard_intake"},
      "historia_sintomas":         {"completed": true, "phase": "conversational_symptoms"},
      "impacto_funcional":         {"completed": true, "phase": "conversational_symptoms"},
      "respuesta_previa":          {"completed": true, "phase": "conversational_symptoms"},
      "seguridad_clinica":         {"completed": true, "phase": "wizard_safety"},
      "antecedentes_mentales":     {"completed": true, "phase": "wizard_safety"},
      "contraindicaciones_medicas":{"completed": true, "phase": "wizard_safety"},
      "monitoreo_tratamiento":     {"completed": true, "phase": "conversational_closure"},
      "objetivos_terapeuticos":    {"completed": true, "phase": "conversational_closure"},
      "aclaraciones_finales":      {"completed": true, "phase": "conversational_closure"}
    }'::jsonb,
    false,
    true,
    true,
    NOW() - INTERVAL '2 days'
  ) ON CONFLICT (patient_id) DO NOTHING;

  INSERT INTO public.psychiatry_intake_sections (intake_id, section, phase, data, completed, completed_at)
  VALUES
    (
      v_intake_2, 'consulta_actual', 'wizard_intake',
      '{
        "motivo_consulta": "Primera consulta. Llevo años con dificultades de concentración y organización. Médica clínica sugirió evaluación psiquiátrica.",
        "tiempo_sintomas": "desde la infancia, pero se hizo más evidente en la facultad",
        "tipo_consulta": "primera_vez"
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'diagnostico_y_tratamiento', 'wizard_intake',
      '{
        "diagnostico_previo": "sin diagnóstico psiquiátrico previo",
        "medicacion_actual": [],
        "adherencia": "no aplica",
        "evaluaciones_previas": "psicóloga educacional en 2018 — sin diagnóstico formal",
        "psicoterapia_actual": false
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'contexto_personal', 'wizard_intake',
      '{
        "ocupacion": "Estudiante universitaria (Lic. en Comunicación, 4to año)",
        "situacion_laboral": "estudiante con trabajo part-time en hostelería",
        "situacion_familiar": "vive sola, separada de sus padres",
        "nivel_educativo": "universitario_incompleto",
        "red_apoyo": "amigas y madre"
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'historia_sintomas', 'conversational_symptoms',
      '{
        "descripcion": "Desde chica me costaba seguir las clases. En la primaria me decían que era distraída y soñadora. En la secundaria pude compensar estudiando mucho más que mis compañeras para llegar al mismo resultado. En la facultad ya no puedo compensar, las materias son muy densas y no termino de leer los textos. En el trabajo me olvido cosas todo el tiempo y mis jefes me lo dicen.",
        "patron_horario": "variable, peor en ambientes ruidosos o con múltiples tareas simultáneas",
        "sintomas_predominantes": ["desatención", "hiperactividad interna", "impulsividad en decisiones", "hipersensibilidad emocional", "dificultad para terminar tareas"]
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'impacto_funcional', 'conversational_symptoms',
      '{
        "impacto_academico": "severo — llevo 3 materias en suspenso, no logro aprobar parciales",
        "impacto_laboral": "moderado — olvidos frecuentes, tardanzas",
        "impacto_social": "moderado — interrupción en conversaciones, dificultad para mantener planes",
        "impacto_emocional": "alto — frustración crónica, baja autoestima académica"
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'respuesta_previa', 'conversational_symptoms',
      '{
        "tratamientos_previos": "ninguno farmacológico",
        "estrategias_compensatorias": "listas escritas, alarmas en el celular, pedirle a amigas que me recuerden cosas",
        "efectividad_estrategias": "parcial — funcionan a veces pero no son sostenibles"
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'seguridad_clinica', 'wizard_safety',
      '{
        "ideacion_suicida": false,
        "autolesiones": false,
        "consumo_sustancias": "marihuana recreativa ocasional (fines de semana)",
        "riesgo_actual": "ninguno"
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'antecedentes_mentales', 'wizard_safety',
      '{
        "internaciones_psiquiatricas": false,
        "intentos_suicidio": false,
        "episodios_maniacos": false,
        "antecedentes_familiares": "madre con diagnóstico de ansiedad, hermano menor con TDAH en tratamiento"
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'contraindicaciones_medicas', 'wizard_safety',
      '{
        "enfermedades_cardiovasculares": false,
        "hipertension": false,
        "epilepsia": false,
        "glaucoma": false,
        "embarazo": false,
        "alergias_medicamentos": "penicilina (urticaria)"
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'monitoreo_tratamiento', 'conversational_closure',
      '{
        "frecuencia_control": "quincenal al inicio",
        "parametros_monitoreo": ["tensión arterial", "peso", "apetito", "sueño", "rendimiento académico"],
        "estudios_solicitados": ["ECG basal", "hemograma", "perfil tiroideo"]
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'objetivos_terapeuticos', 'conversational_closure',
      '{
        "objetivos_paciente": "Poder terminar de leer un texto sin releerlo 5 veces. Aprobar las materias en suspenso. Llegar a tiempo al trabajo.",
        "objetivo_medico": "Iniciar tratamiento farmacológico supervisado una vez confirmado diagnóstico. Derivación a psicoterapia TCC.",
        "plazo": "6 meses"
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    ),
    (
      v_intake_2, 'aclaraciones_finales', 'conversational_closure',
      '{
        "dudas_paciente": "¿El metilfenidato crea dependencia? ¿Voy a tomarlo toda la vida? ¿Afecta el embarazo en el futuro?",
        "comentario_final": "Nunca tuve quien me explicara qué me pasa. Me alegra poder tener un diagnóstico real.",
        "consentimiento_informado": true
      }'::jsonb,
      true, NOW() - INTERVAL '2 days'
    )
  ON CONFLICT (intake_id, section) DO NOTHING;

  -- ==========================================================================
  -- CLINICAL CASE STATE — Rodrigo Peralta (caso urgente, triage priority)
  -- ==========================================================================

  INSERT INTO public.clinical_case_states (
    id,
    case_id,
    patient_id,
    workflow_type,
    current_segment,
    completed_segments,
    state,
    integrity_score,
    integrity_status,
    missing_field_count,
    conflicted_field_count,
    locked_field_count,
    triage_priority,
    triage_mandate
  ) VALUES (
    v_case_1,
    v_case_1,   -- case_id = mismo UUID para simplicidad
    v_patient_3,
    'psychiatry_first_visit',
    'seguridad_clinica',
    ARRAY['identity','motivo_consulta','medicacion_actual','historia_sintomas','impacto_funcional'],
    '{
      "identity": {
        "patientId": "dd000003-0000-0000-0000-000000000003",
        "workflowType": "psychiatry_first_visit",
        "startedAt": "2026-04-09T14:30:00Z"
      },
      "fields": {
        "nombre_completo": {
          "value": "Rodrigo Peralta",
          "source": "profile",
          "confidence": 1.0,
          "locked": false,
          "conflicts": []
        },
        "edad": {
          "value": 36,
          "source": "calculated",
          "confidence": 1.0,
          "locked": false,
          "conflicts": []
        },
        "diagnostico_principal": {
          "value": "Trastorno de ansiedad generalizada (F41.1)",
          "source": "doctor",
          "confidence": 0.95,
          "locked": true,
          "conflicts": []
        },
        "medicacion_actual": {
          "value": [
            {"nombre": "sertralina", "dosis": "100mg", "frecuencia": "mañana"},
            {"nombre": "alprazolam", "dosis": "0.25mg", "frecuencia": "según necesidad"}
          ],
          "source": "patient_intake",
          "confidence": 0.9,
          "locked": false,
          "conflicts": []
        },
        "episodio_panico_reciente": {
          "value": true,
          "source": "patient_intake",
          "confidence": 1.0,
          "locked": false,
          "conflicts": []
        },
        "frecuencia_episodios": {
          "value": "2 episodios en los últimos 7 días",
          "source": "patient_intake",
          "confidence": 0.85,
          "locked": false,
          "conflicts": []
        },
        "ideacion_suicida": {
          "value": false,
          "source": "patient_intake",
          "confidence": 0.98,
          "locked": false,
          "conflicts": []
        }
      },
      "triage": {
        "priority": "priority",
        "mandate": "Evaluar necesidad de ajuste de dosis de sertralina ante recurrencia de episodios de pánico a pesar de dosis terapéutica. Valorar agregar psicoterapia de exposición. Descartar causa orgánica (TSH, hemograma).",
        "flags": ["panico_recurrente", "exposicion_pendiente"],
        "sla_hours": 24,
        "escalated_at": null
      },
      "snapshot": {
        "generatedAt": "2026-04-09T14:45:00Z",
        "completedSegments": ["identity","motivo_consulta","medicacion_actual","historia_sintomas","impacto_funcional"],
        "pendingSegments": ["seguridad_clinica","cierre"]
      }
    }'::jsonb,
    87,
    'healthy',
    1,
    0,
    1,
    'priority',
    'Evaluar ajuste de sertralina por recurrencia de pánico. Valorar exposición cognitivo-conductual.'
  ) ON CONFLICT (case_id) DO NOTHING;

  RAISE NOTICE '=== seed_demo_doctor completado ===';
  RAISE NOTICE 'Doctor ID: %', v_doctor_id;
  RAISE NOTICE 'Pacientes demo: 7';
  RAISE NOTICE 'Turnos hoy: 3 (confirmed x2, scheduled x1)';
  RAISE NOTICE 'Turnos esta semana: 2';
  RAISE NOTICE 'Turnos completados (historial): 2';
  RAISE NOTICE 'Intakes psiquiátricos: 2 (aprobado + completado)';
  RAISE NOTICE 'Clinical case states: 1 (triage priority)';

END $$;
