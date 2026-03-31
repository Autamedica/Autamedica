/**
 * Configuración de pasos de Anamnesis
 * Diseño: mínimo texto, máxima claridad, cero estrés cognitivo.
 */

import type { AnamnesisStep } from '../types/anamnesis';

export const anamnesisSteps: AnamnesisStep[] = [
  // PASO 1: Fecha de nacimiento
  {
    id: 'edad',
    title: 'Tu fecha de nacimiento',
    subtitle: 'Tu edad se calcula automáticamente',
    category: 'filiacion',
    mutability: 'carry_forward',
    completed: false,
    fields: [
      {
        id: 'fecha_nacimiento',
        type: 'date',
        label: 'Fecha de nacimiento',
        required: true,
      },
    ],
  },

  // PASO 2: Ocupación
  {
    id: 'ocupacion',
    title: 'Tu trabajo',
    subtitle: 'Nos ayuda a entender tu rutina diaria',
    category: 'filiacion',
    mutability: 'confirm_on_revisit',
    completed: false,
    fields: [
      {
        id: 'ocupacion_actual',
        type: 'text',
        label: '¿A qué te dedicás?',
        placeholder: 'Ej: Maestra, oficinista, albañil...',
        required: true,
      },
      {
        id: 'años_ocupacion',
        type: 'number',
        label: '¿Cuántos años llevás en este trabajo?',
        placeholder: 'Ej: 10',
        required: false,
      },
      {
        id: 'exposicion_riesgos',
        type: 'multiselect',
        label: '¿Estás expuesto a alguno de estos?',
        required: false,
        options: [
          { value: 'quimicos', label: 'Químicos o vapores' },
          { value: 'ruido', label: 'Ruido intenso' },
          { value: 'polvo', label: 'Polvo o partículas' },
          { value: 'pantallas', label: 'Pantallas muchas horas' },
          { value: 'cargas', label: 'Cargar peso frecuente' },
          { value: 'estres', label: 'Estrés laboral alto' },
        ],
      },
    ],
  },

  // PASO 3: Motivo de consulta
  {
    id: 'motivo_consulta',
    title: '¿Qué te trae hoy?',
    subtitle: 'Contanos con tus palabras',
    category: 'motivo_consulta',
    mutability: 'per_visit',
    completed: false,
    fields: [
      {
        id: 'sintoma_principal',
        type: 'textarea',
        label: 'Describí qué te está molestando',
        placeholder: 'Ej: Me duele la cabeza del lado derecho, como si me palpitara...',
        required: true,
      },
      {
        id: 'cuando_empezo',
        type: 'select',
        label: '¿Cuándo empezó?',
        required: true,
        options: [
          { value: 'hoy', label: 'Hoy' },
          { value: '2-7dias', label: 'Hace 2-7 días' },
          { value: '1-4semanas', label: 'Hace 1-4 semanas' },
          { value: '1-6meses', label: 'Hace 1-6 meses' },
          { value: 'mas6meses', label: 'Más de 6 meses' },
        ],
      },
      {
        id: 'intensidad_sintoma',
        type: 'scale',
        label: '¿Qué tan fuerte es? (1 = leve, 10 = insoportable)',
        required: true,
        validation: { min: 1, max: 10 },
      },
    ],
  },

  // PASO 4: Enfermedades previas
  {
    id: 'enfermedades_previas',
    title: 'Enfermedades previas',
    subtitle: 'Condiciones que tenés o tuviste',
    category: 'antecedentes_personales',
    mutability: 'carry_forward_additive',
    completed: false,
    fields: [
      {
        id: 'enfermedades_cronicas',
        type: 'multiselect',
        label: '¿Tenés o tuviste alguna de estas?',
        required: true,
        options: [
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'hipertension', label: 'Presión alta' },
          { value: 'asma', label: 'Asma' },
          { value: 'epilepsia', label: 'Epilepsia' },
          { value: 'cancer', label: 'Cáncer' },
          { value: 'hepatitis', label: 'Hepatitis B o C' },
          { value: 'vih', label: 'VIH' },
          { value: 'tiroides', label: 'Problemas de tiroides' },
          { value: 'ninguna', label: 'Ninguna' },
        ],
      },
    ],
  },

  // PASO 5: Medicamentos
  {
    id: 'medicamentos',
    title: 'Medicamentos',
    subtitle: '¿Qué estás tomando actualmente?',
    category: 'antecedentes_personales',
    mutability: 'confirm_on_revisit',
    completed: false,
    fields: [
      {
        id: 'toma_medicamentos',
        type: 'boolean',
        label: '¿Tomás algún medicamento?',
        required: true,
      },
      {
        id: 'lista_medicamentos',
        type: 'textarea',
        label: 'Listá tus medicamentos (nombre, dosis, para qué)',
        placeholder: 'Ej:\n- Enalapril 10mg, 1 por día, para presión\n- Metformina 850mg, para diabetes',
        required: false,
        dependsOn: { fieldId: 'toma_medicamentos', value: true },
        tooltip: 'Incluí suplementos y vitaminas también',
      },
    ],
  },

  // PASO 6: Alergias
  {
    id: 'alergias',
    title: 'Alergias',
    subtitle: 'A medicamentos, alimentos u otras sustancias',
    category: 'antecedentes_personales',
    mutability: 'carry_forward_additive',
    completed: false,
    fields: [
      {
        id: 'tiene_alergias',
        type: 'boolean',
        label: '¿Tenés alguna alergia?',
        required: true,
      },
      {
        id: 'lista_alergias',
        type: 'textarea',
        label: 'Listá tus alergias y qué te pasó',
        placeholder: 'Ej:\n- Penicilina: ronchas e hinchazón\n- Mariscos: vómitos',
        required: false,
        dependsOn: { fieldId: 'tiene_alergias', value: true },
      },
    ],
  },

  // PASO 7: Antecedentes familiares
  {
    id: 'antecedentes_familiares',
    title: 'Tu familia',
    subtitle: 'Enfermedades de tus padres y hermanos',
    category: 'antecedentes_familiares',
    mutability: 'carry_forward',
    completed: false,
    fields: [
      {
        id: 'padre_vivo',
        type: 'boolean',
        label: '¿Tu papá está vivo?',
        required: true,
      },
      {
        id: 'padre_edad',
        type: 'number',
        label: 'Edad actual de tu papá',
        placeholder: 'Ej: 65',
        required: false,
        dependsOn: { fieldId: 'padre_vivo', value: true },
        validation: { min: 0, max: 120 },
      },
      {
        id: 'padre_enfermedades',
        type: 'multiselect',
        label: 'Enfermedades de tu papá',
        required: false,
        options: [
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'hipertension', label: 'Presión alta' },
          { value: 'infarto', label: 'Infarto' },
          { value: 'cancer', label: 'Cáncer' },
          { value: 'colesterol_alto', label: 'Colesterol alto' },
          { value: 'ninguna', label: 'Ninguna' },
        ],
      },
      {
        id: 'padre_causa_muerte',
        type: 'text',
        label: '¿De qué falleció? (si aplica)',
        placeholder: 'Ej: Infarto a los 52 años',
        required: false,
        dependsOn: { fieldId: 'padre_vivo', value: false },
      },
      {
        id: 'madre_viva',
        type: 'boolean',
        label: '¿Tu mamá está viva?',
        required: true,
      },
      {
        id: 'madre_edad',
        type: 'number',
        label: 'Edad actual de tu mamá',
        placeholder: 'Ej: 62',
        required: false,
        dependsOn: { fieldId: 'madre_viva', value: true },
        validation: { min: 0, max: 120 },
      },
      {
        id: 'madre_enfermedades',
        type: 'multiselect',
        label: 'Enfermedades de tu mamá',
        required: false,
        options: [
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'hipertension', label: 'Presión alta' },
          { value: 'cancer_mama', label: 'Cáncer de mama' },
          { value: 'cancer_ovario', label: 'Cáncer de ovario' },
          { value: 'osteoporosis', label: 'Osteoporosis' },
          { value: 'tiroides', label: 'Problemas de tiroides' },
          { value: 'ninguna', label: 'Ninguna' },
        ],
      },
      {
        id: 'madre_causa_muerte',
        type: 'text',
        label: '¿De qué falleció? (si aplica)',
        placeholder: 'Ej: Cáncer de mama a los 58 años',
        required: false,
        dependsOn: { fieldId: 'madre_viva', value: false },
      },
      {
        id: 'hermanos_enfermedades',
        type: 'multiselect',
        label: '¿Tus hermanos tienen alguna de estas?',
        required: false,
        options: [
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'cancer_joven', label: 'Cáncer antes de 50 años' },
          { value: 'enfermedad_mental', label: 'Depresión o bipolaridad' },
          { value: 'autoinmune', label: 'Enfermedad autoinmune' },
          { value: 'no_hermanos', label: 'No tengo hermanos' },
          { value: 'ninguna', label: 'Ninguna' },
        ],
      },
    ],
  },

  // PASO 8: Hábitos
  {
    id: 'habitos',
    title: 'Tus hábitos',
    subtitle: 'Tabaco, alcohol, ejercicio y sueño',
    category: 'antecedentes_personales',
    mutability: 'confirm_on_revisit',
    completed: false,
    fields: [
      {
        id: 'fuma',
        type: 'select',
        label: '¿Fumás o fumaste?',
        required: true,
        options: [
          { value: 'nunca', label: 'Nunca' },
          { value: 'exfumador', label: 'Fumé antes, ya dejé' },
          { value: 'actual', label: 'Sí, fumo actualmente' },
        ],
      },
      {
        id: 'cigarrillos_dia',
        type: 'number',
        label: '¿Cuántos cigarrillos por día?',
        placeholder: 'Ej: 10',
        required: false,
        dependsOn: { fieldId: 'fuma', value: 'actual' },
        validation: { min: 0, max: 100 },
      },
      {
        id: 'años_fumando',
        type: 'number',
        label: '¿Cuántos años fumás o fumaste?',
        placeholder: 'Ej: 15',
        required: false,
        dependsOn: { fieldId: 'fuma', value: 'actual' },
        validation: { min: 0, max: 80 },
      },
      {
        id: 'alcohol',
        type: 'select',
        label: '¿Tomás alcohol?',
        required: true,
        options: [
          { value: 'nunca', label: 'No' },
          { value: 'ocasional', label: '1-2 veces al mes' },
          { value: 'moderado', label: '1-2 veces por semana' },
          { value: 'frecuente', label: '3-6 veces por semana' },
          { value: 'diario', label: 'Todos los días' },
        ],
      },
      {
        id: 'ejercicio',
        type: 'select',
        label: '¿Hacés ejercicio?',
        required: true,
        options: [
          { value: 'sedentario', label: 'No, soy sedentario' },
          { value: 'ligero', label: 'Poco (1-2 veces/semana)' },
          { value: 'moderado', label: 'Regular (3-4 veces/semana)' },
          { value: 'intenso', label: 'Mucho (5+ veces/semana)' },
        ],
      },
      {
        id: 'horas_sueno',
        type: 'scale',
        label: '¿Cuántas horas dormís por noche?',
        required: true,
        validation: { min: 1, max: 12 },
      },
      {
        id: 'dieta',
        type: 'select',
        label: '¿Cómo comés?',
        required: true,
        options: [
          { value: 'muy_mala', label: 'Mucha comida rápida' },
          { value: 'regular', label: 'Mezcla de todo' },
          { value: 'buena', label: 'Principalmente casera' },
          { value: 'excelente', label: 'Muy saludable' },
        ],
      },
    ],
  },

  // PASO 9: Cardiovascular
  {
    id: 'cardiovascular',
    title: 'Corazón y circulación',
    subtitle: '¿Notaste algo en el pecho o la circulación?',
    category: 'revision_sistemas',
    mutability: 'per_visit',
    completed: false,
    fields: [
      {
        id: 'dolor_pecho',
        type: 'boolean',
        label: '¿Tuviste dolor o molestia en el pecho?',
        required: true,
      },
      {
        id: 'dolor_pecho_detalle',
        type: 'textarea',
        label: 'Describí el dolor: ¿dónde, cuándo, cómo es?',
        placeholder: 'Ej: Dolor en centro del pecho, opresivo, cuando subo escaleras',
        required: false,
        dependsOn: { fieldId: 'dolor_pecho', value: true },
      },
      {
        id: 'falta_aire',
        type: 'boolean',
        label: '¿Te falta el aire o te cuesta respirar?',
        required: true,
      },
      {
        id: 'palpitaciones',
        type: 'boolean',
        label: '¿Sentís que tu corazón late rápido o irregular?',
        required: true,
      },
      {
        id: 'hinchazon_piernas',
        type: 'boolean',
        label: '¿Se te hinchan los pies o piernas?',
        required: true,
      },
      {
        id: 'sintomas_cardiovasculares',
        type: 'multiselect',
        label: '¿Tuviste alguno de estos?',
        required: false,
        options: [
          { value: 'mareos', label: 'Mareos o desmayos' },
          { value: 'sudoracion', label: 'Sudoración fría sin razón' },
          { value: 'fatiga_extrema', label: 'Cansancio extremo' },
          { value: 'tos_nocturna', label: 'Tos al acostarte' },
          { value: 'ninguno', label: 'Ninguno' },
        ],
      },
    ],
  },

  // PASO 10: Respiratorio
  {
    id: 'respiratorio',
    title: 'Pulmones',
    subtitle: '¿Tenés tos o problemas para respirar?',
    category: 'revision_sistemas',
    mutability: 'per_visit',
    completed: false,
    fields: [
      {
        id: 'tos',
        type: 'boolean',
        label: '¿Tenés tos persistente (más de 3 semanas)?',
        required: true,
      },
      {
        id: 'tos_detalle',
        type: 'textarea',
        label: 'Describí tu tos: ¿seca o con flema? ¿Cuándo es peor?',
        placeholder: 'Ej: Tos seca por las noches, llevo 5 semanas',
        required: false,
        dependsOn: { fieldId: 'tos', value: true },
      },
      {
        id: 'falta_aire_respiratorio',
        type: 'boolean',
        label: '¿Te falta el aire al hacer esfuerzos?',
        required: true,
      },
      {
        id: 'silbido_pecho',
        type: 'boolean',
        label: '¿Escuchás silbidos en el pecho al respirar?',
        required: true,
      },
      {
        id: 'sintomas_respiratorios',
        type: 'multiselect',
        label: '¿Tuviste alguno de estos?',
        required: false,
        options: [
          { value: 'sangre_tos', label: 'Sangre al toser' },
          { value: 'dolor_respirar', label: 'Dolor al respirar profundo' },
          { value: 'ronquidos', label: 'Ronquidos fuertes con pausas' },
          { value: 'flema_color', label: 'Flema amarilla o verde' },
          { value: 'ninguno', label: 'Ninguno' },
        ],
      },
    ],
  },

  // PASO 11: Digestivo
  {
    id: 'digestivo',
    title: 'Digestión',
    subtitle: '¿Tenés molestias digestivas?',
    category: 'revision_sistemas',
    mutability: 'per_visit',
    completed: false,
    fields: [
      {
        id: 'acidez',
        type: 'boolean',
        label: '¿Tenés acidez o reflujo seguido?',
        required: true,
      },
      {
        id: 'dolor_abdominal',
        type: 'boolean',
        label: '¿Tenés dolor de panza persistente?',
        required: true,
      },
      {
        id: 'cambio_habito_intestinal',
        type: 'select',
        label: '¿Cambió tu ritmo intestinal?',
        required: true,
        options: [
          { value: 'no', label: 'No, todo normal' },
          { value: 'diarrea', label: 'Diarrea frecuente' },
          { value: 'estrenimiento', label: 'Estreñimiento' },
          { value: 'alternante', label: 'Alterno entre diarrea y estreñimiento' },
        ],
      },
      {
        id: 'sintomas_digestivos',
        type: 'multiselect',
        label: '¿Tuviste alguno de estos?',
        required: false,
        options: [
          { value: 'sangre_heces', label: 'Sangre en las heces' },
          { value: 'heces_negras', label: 'Heces negras' },
          { value: 'perdida_peso', label: 'Bajaste de peso sin hacer dieta' },
          { value: 'dificultad_tragar', label: 'Dificultad para tragar' },
          { value: 'nausea_vomito', label: 'Náuseas o vómitos seguidos' },
          { value: 'hinchazon', label: 'Hinchazón abdominal constante' },
          { value: 'ninguno', label: 'Ninguno' },
        ],
      },
    ],
  },

  // PASO 12: Genitourinario
  {
    id: 'genitourinario',
    title: 'Sistema urinario',
    subtitle: '¿Tenés molestias al orinar?',
    category: 'revision_sistemas',
    mutability: 'per_visit',
    completed: false,
    fields: [
      {
        id: 'dolor_orinar',
        type: 'boolean',
        label: '¿Tenés dolor o ardor al orinar?',
        required: true,
      },
      {
        id: 'frecuencia_urinaria',
        type: 'select',
        label: '¿Cambió tu frecuencia para orinar?',
        required: true,
        options: [
          { value: 'normal', label: 'No, todo normal' },
          { value: 'frecuente_dia', label: 'Orino muy seguido de día' },
          { value: 'frecuente_noche', label: 'Me levanto mucho de noche' },
          { value: 'urgencia', label: 'Urgencia (casi no llego)' },
        ],
      },
      {
        id: 'sintomas_genitourinarios',
        type: 'multiselect',
        label: '¿Tuviste alguno de estos?',
        required: false,
        options: [
          { value: 'sangre_orina', label: 'Sangre en la orina' },
          { value: 'chorro_debil', label: 'Chorro débil o cortado' },
          { value: 'incontinencia', label: 'Pérdida involuntaria de orina' },
          { value: 'dolor_lumbar', label: 'Dolor en zona de riñones' },
          { value: 'ninguno', label: 'Ninguno' },
        ],
      },
    ],
  },

  // PASO 13: Resumen final
  {
    id: 'resumen_final',
    title: 'Último paso',
    subtitle: 'Confirmá y agregá lo que quieras',
    category: 'revision_sistemas',
    mutability: 'per_visit',
    completed: false,
    fields: [
      {
        id: 'confirma_informacion',
        type: 'boolean',
        label: '¿Confirmás que la información es correcta?',
        required: true,
      },
      {
        id: 'comentarios_adicionales',
        type: 'textarea',
        label: '¿Algo más que quieras que tu médico sepa?',
        placeholder: 'Ej: Tengo miedo a las agujas, prefiero doctora mujer...',
        required: false,
      },
    ],
  },
];
