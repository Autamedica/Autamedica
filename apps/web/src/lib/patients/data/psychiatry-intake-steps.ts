import type {
  PsychiatryConversationPrompt,
  PsychiatryIntakePhase,
  PsychiatryIntakeSection,
  PsychiatryIntakeStep,
} from '@/lib/patients/types/psychiatry-intake'

export const PSYCHIATRY_INTAKE_SECTIONS: readonly PsychiatryIntakeSection[] = [
  'consulta_actual',
  'diagnostico_y_tratamiento',
  'contexto_personal',
  'historia_sintomas',
  'impacto_funcional',
  'respuesta_previa',
  'seguridad_clinica',
  'antecedentes_mentales',
  'contraindicaciones_medicas',
  'monitoreo_tratamiento',
  'objetivos_terapeuticos',
  'aclaraciones_finales',
] as const

export const psychiatryWizardIntakeSteps: PsychiatryIntakeStep[] = [
  {
    id: 'consulta_actual',
    phase: 'wizard_intake',
    title: '¿En qué podemos ayudarte hoy?',
    subtitle: 'El primer paso es entender cuáles son tus necesidades y cómo podemos acompañarte en este proceso.',
    category: 'motivo_consulta',
    mutability: 'per_visit',
    completed: false,
    fields: [
      {
        id: 'motivo_consulta',
        type: 'textarea',
        label: 'Describinos brevemente el motivo principal de tu consulta',
        placeholder: 'Ej: "Busco una evaluación para TDAH", "Necesito orientación sobre mi tratamiento actual", "Experimento dificultades de concentración en el trabajo"',
        required: true,
      },
      {
        id: 'objetivo_consulta',
        type: 'select',
        label: '¿Cuál es el objetivo principal de esta evaluación?',
        required: true,
        options: [
          { value: 'inicio', label: 'Empezar un tratamiento nuevo' },
          { value: 'continuidad', label: 'Continuar mi tratamiento actual' },
          { value: 'ajuste', label: 'Ajustar mi dosis o medicación' },
          { value: 'segunda_opinion', label: 'Obtener una segunda opinión' },
          { value: 'otro', label: 'Otro motivo' },
        ],
      },
    ],
  },
  {
    id: 'diagnostico_y_tratamiento',
    phase: 'wizard_intake',
    title: 'Historia Clínica y Tratamiento',
    subtitle: 'Documentar tu historial médico nos permite brindarte una atención más precisa y segura.',
    category: 'antecedentes_personales',
    mutability: 'confirm_on_revisit',
    completed: false,
    fields: [
      {
        id: 'diagnostico_tdah_confirmado',
        type: 'boolean',
        label: '¿Contás con un diagnóstico previo realizado por un profesional psiquiátrico?',
        required: true,
      },
      {
        id: 'diagnostico_texto',
        type: 'text',
        label: 'Especificación del diagnóstico',
        placeholder: 'Ej: Trastorno de ansiedad, Depresión, TDAH, etc.',
        required: false,
      },
      {
        id: 'tratamiento_actual',
        type: 'boolean',
        label: '¿Te encontrás actualmente bajo tratamiento farmacológico psiquiátrico?',
        required: true,
      },
      {
        id: 'medicacion_actual',
        type: 'select',
        label: '¿Qué medicación te fue prescripta?',
        required: false,
        dependsOn: { fieldId: 'tratamiento_actual', value: true },
        options: [
          { value: 'antidepresivos', label: 'Antidepresivos' },
          { value: 'ansioliticos', label: 'Ansiolíticos' },
          { value: 'estabilizadores', label: 'Estabilizadores del ánimo' },
          { value: 'estimulantes', label: 'Estimulantes' },
          { value: 'otro', label: 'Otro medicamento' },
        ],
      },
      {
        id: 'dosis_actual',
        type: 'text',
        label: '¿Cuál es la dosis indicada?',
        placeholder: 'Ej: Sertralina 50 mg, Clonazepam 0.5 mg',
        required: false,
        dependsOn: { fieldId: 'tratamiento_actual', value: true },
      },
      {
        id: 'prescriptor_actual',
        type: 'text',
        label: 'Profesional tratante',
        placeholder: 'Nombre del médico o especialista que indicó el tratamiento actual',
        required: false,
        dependsOn: { fieldId: 'tratamiento_actual', value: true },
      },
    ],
  },
  {
    id: 'contexto_personal',
    phase: 'wizard_intake',
    title: 'Contexto Personal y Funcional',
    subtitle: 'Comprender tu entorno y dinámica diaria es fundamental para evaluar el impacto en tu calidad de vida.',
    category: 'filiacion',
    mutability: 'confirm_on_revisit',
    completed: false,
    fields: [
      {
        id: 'ocupacion_actual',
        type: 'text',
        label: 'Ocupación principal',
        placeholder: 'Ej: Estudiante universitario, profesional independiente, empleado administrativo',
        required: true,
      },
      {
        id: 'rutina_principal',
        type: 'textarea',
        label: 'Dinámica cotidiana',
        placeholder: 'Explicanos brevemente tu rutina: horarios principales, momentos de mayor exigencia y en qué situaciones experimentás mayores desafíos.',
        required: true,
      },
    ],
  },
]

export const psychiatryConversationalSymptomPrompts: PsychiatryConversationPrompt[] = [
  {
    id: 'historia_sintomas',
    phase: 'conversational_symptoms',
    title: 'Manifestación Clínica',
    subtitle: 'Detallanos los síntomas y dificultades que experimentás con mayor frecuencia.',
    field: {
      id: 'relato_sintomas',
      type: 'textarea',
      label: '¿Cuáles son los síntomas principales que motivan esta consulta?',
      placeholder: 'Ej: Cambios en el estado de ánimo, ansiedad, dificultades de concentración, alteraciones del sueño...',
      required: true,
    },
  },
  {
    id: 'impacto_funcional',
    phase: 'conversational_symptoms',
    title: 'Impacto Funcional',
    subtitle: 'Evaluaremos cómo estos síntomas interfieren en tu desempeño académico, laboral y social.',
    field: {
      id: 'impacto_estudio_trabajo',
      type: 'textarea',
      label: '¿Cómo afectan estos síntomas a tu vida cotidiana?',
      placeholder: 'Describinos el impacto en tu productividad, relaciones interpersonales y organización diaria.',
      required: true,
    },
  },
  {
    id: 'respuesta_previa',
    phase: 'conversational_symptoms',
    title: 'Respuesta a Tratamientos Previos',
    subtitle: 'Tu experiencia pasada nos ayuda a trazar el plan terapéutico más adecuado y seguro para vos.',
    field: {
      id: 'respuesta_previa_estimulantes',
      type: 'textarea',
      label: 'Si recibiste tratamiento anteriormente, ¿cómo describirías tu respuesta clínica?',
      placeholder: 'Describí los beneficios observados y cualquier efecto secundario experimentado. Si es tu primera vez, indicalo aquí.',
      required: true,
    },
  },
]

export const psychiatryWizardSafetySteps: PsychiatryIntakeStep[] = [
  {
    id: 'seguridad_clinica',
    phase: 'wizard_safety',
    title: 'Evaluación de Seguridad Clínica',
    subtitle: 'Por tu seguridad, solicitamos que respondas con precisión para descartar contraindicaciones médicas.',
    category: 'revision_sistemas',
    mutability: 'per_visit',
    completed: false,
    fields: [
      { id: 'insomnio_actual', type: 'boolean', label: '¿Experimentás alteraciones del sueño o insomnio en la actualidad?', required: true },
      { id: 'palpitaciones', type: 'boolean', label: '¿Has experimentado palpitaciones o taquicardia recientemente?', required: true },
      { id: 'dolor_pecho', type: 'boolean', label: '¿Has presentado dolor, opresión en el pecho o falta de aire?', required: true },
      { id: 'ideas_autolesion', type: 'boolean', label: '¿Has experimentado ideación suicida o pensamientos de autolesión?', required: true },
      { id: 'crisis_panico', type: 'boolean', label: '¿Has sufrido episodios de ansiedad intensa o ataques de pánico?', required: true },
    ],
  },
  {
    id: 'antecedentes_mentales',
    phase: 'wizard_safety',
    title: 'Antecedentes Psiquiátricos',
    subtitle: 'Identificá condiciones relevantes presentes o pasadas en tu historial clínico.',
    category: 'antecedentes_personales',
    mutability: 'carry_forward_additive',
    completed: false,
    fields: [
      {
        id: 'antecedentes_relevantes',
        type: 'multiselect',
        label: 'Comorbilidades o antecedentes diagnosticados:',
        required: true,
        options: [
          { value: 'ansiedad', label: 'Ansiedad' },
          { value: 'depresion', label: 'Depresión' },
          { value: 'bipolaridad', label: 'Trastorno bipolar' },
          { value: 'psicosis', label: 'Psicosis' },
          { value: 'consumo_problematico', label: 'Consumo problemático de sustancias' },
          { value: 'ninguno', label: 'Ninguno de estos' },
        ],
      },
    ],
  },
  {
    id: 'contraindicaciones_medicas',
    phase: 'wizard_safety',
    title: 'Antecedentes Médicos Relevantes',
    subtitle: 'Información clínica esencial para garantizar la prescripción segura del tratamiento farmacológico.',
    category: 'revision_sistemas',
    mutability: 'confirm_on_revisit',
    completed: false,
    fields: [
      {
        id: 'contraindicaciones',
        type: 'multiselect',
        label: 'Seleccioná las condiciones que apliquen a tu historial médico:',
        required: true,
        options: [
          { value: 'hipertension_no_controlada', label: 'Hipertensión arterial sin control' },
          { value: 'arritmia', label: 'Arritmia o problema cardíaco' },
          { value: 'sincope', label: 'Desmayos o pérdida de conocimiento' },
          { value: 'muerte_subita_familiar', label: 'Muerte súbita en la familia' },
          { value: 'embarazo', label: 'Embarazo o búsqueda de embarazo' },
          { value: 'ninguna', label: 'Ninguna de estas' },
        ],
      },
    ],
  },
  {
    id: 'monitoreo_tratamiento',
    phase: 'wizard_safety',
    title: 'Monitoreo del Tratamiento Actual',
    subtitle: 'Indicadores de tolerancia y seguimiento para optimizar tu prescripción.',
    category: 'antecedentes_personales',
    mutability: 'per_visit',
    completed: false,
    fields: [
      {
        id: 'apetito',
        type: 'select',
        label: 'Estado del apetito',
        required: true,
        options: [
          { value: 'sin_cambios', label: 'Normal, sin cambios' },
          { value: 'menos_apetito', label: 'Tengo menos hambre' },
          { value: 'mucho_menos_apetito', label: 'Casi no tengo apetito' },
        ],
      },
      {
        id: 'adherencia',
        type: 'select',
        label: 'Adherencia al tratamiento',
        required: true,
        options: [
          { value: 'constante', label: 'Toma diaria regular' },
          { value: 'intermitente', label: 'Toma intermitente / irregular' },
          { value: 'suspendido', label: 'Tratamiento suspendido' },
        ],
      },
      {
        id: 'comentarios_monitoreo',
        type: 'textarea',
        label: 'Observaciones clínicas adicionales (peso, presión arterial, etc.)',
        placeholder: 'Ej: Registro variaciones de peso, dificultades para conciliar el sueño, controles cardiológicos recientes...',
        required: false,
      },
    ],
  },
]

export const psychiatryConversationalClosurePrompts: PsychiatryConversationPrompt[] = [
  {
    id: 'objetivos_terapeuticos',
    phase: 'conversational_closure',
    title: 'Objetivos Terapéuticos',
    subtitle: 'Definir nuestras metas es esencial para alinear las expectativas y medir el progreso del tratamiento.',
    field: {
      id: 'objetivos_tratamiento',
      type: 'textarea',
      label: '¿Qué cambios o mejoras clínicas esperarías lograr a través de la intervención médica?',
      placeholder: 'Ej: Optimizar la capacidad de sostener la atención, mejorar la función ejecutiva, reducir la impulsividad u optimizar la regulación emocional...',
      required: true,
    },
  },
  {
    id: 'aclaraciones_finales',
    phase: 'conversational_closure',
    title: 'Aclaraciones Finales',
    subtitle: 'Espacio adicional para incorporar información de valor para el equipo médico.',
    field: {
      id: 'comentarios_finales',
      type: 'textarea',
      label: 'Observaciones complementarias',
      placeholder: 'Cualquier detalle clínico adicional, inquietudes sobre efectos adversos o información biográfica que consideres relevante mencionar.',
      required: true,
    },
  },
]

export const psychiatryPhaseOrder: readonly PsychiatryIntakePhase[] = [
  'wizard_intake',
  'conversational_symptoms',
  'wizard_safety',
  'conversational_closure',
  'completed',
] as const

export const psychiatryPhaseMeta = {
  wizard_intake: {
    id: 'wizard_intake',
    label: 'Anamnesis I',
    title: 'Apertura Clínica',
    description: 'Recopilación estructurada de motivos de consulta, historial diagnóstico y evaluación funcional básica.',
    mode: 'wizard',
    steps: psychiatryWizardIntakeSteps,
  },
  conversational_symptoms: {
    id: 'conversational_symptoms',
    label: 'Clínica',
    title: 'Exploración Sintomatológica',
    description: 'Evaluación detallada de la presentación fenotípica, impacto funcional e historial farmacológico previo.',
    mode: 'conversational',
    steps: psychiatryConversationalSymptomPrompts,
  },
  wizard_safety: {
    id: 'wizard_safety',
    label: 'Seguridad',
    title: 'Seguridad Médica y Triage',
    description: 'Evaluación algorítmica de contraindicaciones, comorbilidades agudas y perfil de tolerabilidad al tratamiento.',
    mode: 'wizard',
    steps: psychiatryWizardSafetySteps,
  },
  conversational_closure: {
    id: 'conversational_closure',
    label: 'Planificación',
    title: 'Alianza Terapéutica',
    description: 'Definición de objetivos terapéuticos y formalización del cierre de la entrevista.',
    mode: 'conversational',
    steps: psychiatryConversationalClosurePrompts,
  },
  completed: {
    id: 'completed',
    label: 'Procesamiento',
    title: 'Evaluación Clínica Completada',
    description: 'Tu expediente se encuentra formalmente ingresado para revisión por el equipo psiquiátrico.',
    mode: 'pdf',
    steps: [],
  },
} as const

export function getPsychiatryPhaseFromSection(section: PsychiatryIntakeSection): Exclude<PsychiatryIntakePhase, 'completed'> {
  for (const step of psychiatryWizardIntakeSteps) {
    if (step.id === section) {
      return step.phase
    }
  }

  for (const prompt of psychiatryConversationalSymptomPrompts) {
    if (prompt.id === section) {
      return prompt.phase
    }
  }

  for (const step of psychiatryWizardSafetySteps) {
    if (step.id === section) {
      return step.phase
    }
  }

  for (const prompt of psychiatryConversationalClosurePrompts) {
    if (prompt.id === section) {
      return prompt.phase
    }
  }

  return 'wizard_intake'
}
