/**
 * Configuración de pasos de Anamnesis Interactiva
 * Con storytelling analítico (Estilo Editorial NYT)
 */

import type { AnamnesisStep } from '../types/anamnesis';

export const anamnesisSteps: AnamnesisStep[] = [
  // PASO 1: Fecha de nacimiento (edad se calcula automáticamente)
  {
    id: 'edad',
    title: '📅 Tu Fecha de Nacimiento',
    subtitle: 'Tu edad se calcula automáticamente a partir de tu fecha de nacimiento',
    category: 'filiacion',
    completed: false,
    story: {
      intro: 'La edad es el principal factor de contexto clínico. A partir de tu fecha de nacimiento, el sistema calcula tu edad exacta y ajusta automáticamente los parámetros de riesgo.',
      why: 'Las enfermedades tienen ventanas de incidencia claras. Un mismo síntoma sugiere causas benignas en la juventud, pero exige descartar riesgos severos en la madurez.',
      example: 'Un dolor de pecho a los 20 años suele ser muscular; a los 60, los protocolos exigen descartar primero un evento cardiovascular.',
      didYouKnow: 'Tu riesgo base cambia cada década. Los protocolos médicos ajustan el uso de pruebas y medicamentos estrictamente según tu edad biológica.',
    },
    fields: [
      {
        id: 'fecha_nacimiento',
        type: 'date',
        label: 'Fecha de nacimiento',
        required: true,
        tooltip: 'Tu edad se calcula automáticamente. Es necesaria para calibrar farmacocinética y protocolos de vacunación.',
        educationalNote: 'A partir de tu fecha de nacimiento se define tu perfil de riesgo clínico base y se ajustan los parámetros de diagnóstico médico.',
      },
    ],
  },

  // PASO 2: Ocupación
  {
    id: 'ocupacion',
    title: '💼 Tu Trabajo: Pistas Escondidas',
    subtitle: 'Cada profesión tiene sus propios riesgos de salud',
    category: 'filiacion',
    completed: false,
    mediaUrl: '/videos/anamnesis/Tu_Trabajo_Tu_Salud_1.4x.mp4',
    story: {
      intro: 'Tu entorno laboral moldea tu salud. Conocer tu ocupación revela exposiciones crónicas que a menudo pasan desapercibidas en una consulta breve.',
      why: 'El cuerpo acumula el impacto del estrés físico, acústico o químico. Identificar estos factores permite al médico vincular tus síntomas con tu rutina diaria.',
      example: 'La pérdida de audición temprana o los problemas lumbares crónicos suelen tener una correlación directa con años de trabajo en construcción o industria.',
      didYouKnow: 'El trabajo sedentario prolongado se considera un riesgo cardiovascular independiente, con un impacto a largo plazo comparable al tabaquismo leve.',
    },
    fields: [
      {
        id: 'ocupacion_actual',
        type: 'text',
        label: '¿A qué te dedicas actualmente?',
        placeholder: 'Ejemplo: Maestra de primaria',
        required: true,
        educationalNote: 'Ciertas profesiones presentan factores de exposición patológica crónica (física o química).',
      },
      {
        id: 'años_ocupacion',
        type: 'number',
        label: '¿Cuántos años llevas en este trabajo?',
        placeholder: 'Ejemplo: 10',
        required: false,
        tooltip: 'Mide la cronicidad de tu exposición a factores de estrés ambiental.',
      },
      {
        id: 'exposicion_riesgos',
        type: 'multiselect',
        label: '¿Estás expuesto a alguno de estos en tu trabajo?',
        required: false,
        options: [
          { value: 'quimicos', label: 'Químicos o vapores', explanation: 'Asociado a toxicidad hepática o pulmonar.' },
          { value: 'ruido', label: 'Ruido intenso', explanation: 'Asociado a pérdida auditiva neurosensorial.' },
          { value: 'polvo', label: 'Polvo o partículas', explanation: 'Asociado a neumoconiosis o asma ocupacional.' },
          { value: 'pantallas', label: 'Pantallas por muchas horas', explanation: 'Asociado a fatiga visual y sedentarismo.' },
          { value: 'cargas', label: 'Cargar peso frecuentemente', explanation: 'Asociado a discopatía y dolor articular crónico.' },
          { value: 'estres', label: 'Estrés laboral alto', explanation: 'Asociado a riesgo cardiovascular y metabólico.' },
        ],
      },
    ],
  },

  // PASO 3: Motivo de consulta
  {
    id: 'motivo_consulta',
    title: '🎯 ¿Por Qué Consultas Hoy?',
    subtitle: 'Cuéntanos qué te trae por aquí',
    category: 'motivo_consulta',
    completed: false,
    mediaUrl: '/videos/anamnesis/Comunicar_tus_Síntomas_1.4x.mp4',
    story: {
      intro: 'La descripción exacta de tu malestar es el punto de partida clínico. Tu relato define la dirección de la investigación diagnóstica.',
      why: 'Los detalles sobre cuándo y cómo empezó el dolor revelan la evolución de la enfermedad, diferenciando un cuadro agudo de una condición crónica.',
      example: 'Mencionar que tu dolor de cabeza "palpita" o "empeora con la luz" ayuda al médico a distinguir una migraña de una cefalea tensional común.',
      didYouKnow: 'En la medicina basada en evidencia, más del 70% de los diagnósticos precisos se logran únicamente escuchando la cronología de tus síntomas.',
    },
    fields: [
      {
        id: 'sintoma_principal',
        type: 'textarea',
        label: 'Describe con tus palabras qué te está molestando',
        placeholder: 'Ejemplo: Me duele la cabeza del lado derecho, como si me palpitara, y me da cuando estoy estresada...',
        required: true,
        educationalNote: 'La cronología y naturaleza exacta de tu dolor es la pieza central para descartar etiologías graves.',
      },
      {
        id: 'cuando_empezo',
        type: 'select',
        label: '¿Cuándo comenzó este síntoma?',
        required: true,
        options: [
          { value: 'hoy', label: 'Hoy', explanation: 'Manifestación aguda, sugiere intervención inmediata.' },
          { value: '2-7dias', label: 'Hace 2-7 días', explanation: 'Manifestación subaguda, evaluación temprana requerida.' },
          { value: '1-4semanas', label: 'Hace 1-4 semanas', explanation: 'Síntoma de desarrollo reciente o infeccioso.' },
          { value: '1-6meses', label: 'Hace 1-6 meses', explanation: 'Patología en fase de cronificación.' },
          { value: 'mas6meses', label: 'Más de 6 meses', explanation: 'Condición estructural o sistémica crónica.' },
        ],
      },
      {
        id: 'intensidad_sintoma',
        type: 'scale',
        label: 'Intensidad del síntoma (1 = leve, 10 = insoportable)',
        required: true,
        validation: { min: 1, max: 10 },
        tooltip: '1-3: Tolerable. 4-6: Interfiere con rutina. 7-9: Discapacitante. 10: Umbral máximo de dolor.',
      },
    ],
  },

  // PASO 4: Enfermedades previas
  {
    id: 'enfermedades_previas',
    title: '📋 Tus Enfermedades Previas',
    subtitle: 'El pasado médico explica el presente',
    category: 'antecedentes_personales',
    completed: false,
    mediaUrl: '/videos/anamnesis/El_mapa_genético_de_tu_salud_1.4x.mp4',
    story: {
      intro: 'Tu historial médico es el mapa de tu salud. Condiciones crónicas o previas condicionan cómo tu cuerpo responde a nuevas patologías.',
      why: 'Enfermedades como la diabetes o la hipertensión alteran silenciosamente tus sistemas sistémicos, obligando al médico a adaptar sus decisiones terapéuticas.',
      example: 'Un cuadro infeccioso requiere un manejo mucho más agresivo si tienes antecedentes de inmunosupresión o enfermedades metabólicas activas.',
      didYouKnow: 'Condiciones que consideras "controladas" o "antiguas" siguen afectando tu farmacocinética y el riesgo biológico de futuras complicaciones.',
    },
    fields: [
      {
        id: 'enfermedades_cronicas',
        type: 'multiselect',
        label: '¿Tienes o has tenido alguna de estas enfermedades?',
        required: true,
        options: [
          { value: 'diabetes', label: 'Diabetes', explanation: 'Compromete tu sistema vascular y respuesta inmune.' },
          { value: 'hipertension', label: 'Presión alta (Hipertensión)', explanation: 'Eleva críticamente tu riesgo de accidente cerebrovascular.' },
          { value: 'asma', label: 'Asma', explanation: 'Modifica protocolos de oxigenación y anestesia.' },
          { value: 'epilepsia', label: 'Epilepsia', explanation: 'Exige evitar fármacos que reduzcan el umbral convulsivo.' },
          { value: 'cancer', label: 'Cáncer', explanation: 'Requiere evaluación de inmunosupresión o recurrencia.' },
          { value: 'hepatitis', label: 'Hepatitis B o C', explanation: 'Afecta el metabolismo hepático de futuros fármacos.' },
          { value: 'vih', label: 'VIH', explanation: 'Altera el manejo de patógenos oportunistas.' },
          { value: 'tiroides', label: 'Problemas de tiroides', explanation: 'Impacta tu metabolismo basal y función cardíaca.' },
          { value: 'ninguna', label: 'Ninguna de las anteriores', explanation: 'Sin antecedentes clínicos relevantes reportados.' },
        ],
      },
    ],
  },

  // PASO 5: Medicamentos
  {
    id: 'medicamentos',
    title: '💊 Tus Medicamentos Actuales',
    subtitle: 'Saber qué tomas puede salvar tu vida',
    category: 'antecedentes_personales',
    completed: false,
    story: {
      intro: 'Un registro farmacológico inexacto es una de las principales causas de emergencias médicas prevenibles. Para tu médico, cada píldora cuenta.',
      why: 'Los principios activos interactúan constantemente. Pueden anularse, potenciar sus efectos o generar toxicidad sistémica si se combinan por error.',
      example: 'Combinar un anticoagulante recetado con analgésicos comunes de venta libre puede alterar peligrosamente tu capacidad de coagulación sanguínea.',
      didYouKnow: 'Los suplementos "naturales" no son inocuos. Algunos extractos botánicos inhiben enzimas hepáticas, alterando cómo procesas otros medicamentos.',
    },
    fields: [
      {
        id: 'toma_medicamentos',
        type: 'boolean',
        label: '¿Tomas algún medicamento actualmente?',
        required: true,
      },
      {
        id: 'lista_medicamentos',
        type: 'textarea',
        label: 'Lista todos tus medicamentos (nombre, dosis, para qué)',
        placeholder: 'Ejemplo:\n- Enalapril 10mg, 1 por día, para presión\n- Metformina 850mg, 2 por día, para diabetes\n- Omeprazol 20mg, 1 por día, para gastritis',
        required: false,
        dependsOn: { fieldId: 'toma_medicamentos', value: true },
        educationalNote: 'Incluye obligatoriamente suplementos y remedios botánicos; pueden alterar severamente tus funciones hepáticas.',
      },
    ],
  },

  // PASO 6: Alergias
  {
    id: 'alergias',
    title: '⚠️ Alergias: Tu Sistema de Alarma',
    subtitle: 'Una alergia mal reportada puede ser mortal',
    category: 'antecedentes_personales',
    completed: false,
    story: {
      intro: 'Diferenciar una hipersensibilidad real de un efecto adverso protege tu vida y evita limitar tus opciones de tratamiento en urgencias.',
      why: 'Una alergia verdadera detona una respuesta inmunológica sistémica grave. Un efecto secundario es una reacción adversa predecible, pero manejable.',
      example: 'La inflamación súbita del rostro es una alergia severa. Una molestia gástrica tras tomar antibióticos es solo un efecto adverso esperado.',
      didYouKnow: 'Solo el 10% de quienes reportan alergia a la penicilina la padecen realmente. Esto obliga a los médicos a usar alternativas menos eficaces.',
    },
    fields: [
      {
        id: 'tiene_alergias',
        type: 'boolean',
        label: '¿Tienes alergias a medicamentos, alimentos o sustancias?',
        required: true,
      },
      {
        id: 'lista_alergias',
        type: 'textarea',
        label: 'Lista tus alergias y describe QUÉ TE PASÓ exactamente',
        placeholder: 'Ejemplo:\n- Penicilina: ronchas en todo el cuerpo y hinchazón de labios (alergia real)\n- Ibuprofeno: me da dolor de estómago (efecto secundario)\n- Mariscos: vómitos y ronchas (alergia real)',
        required: false,
        dependsOn: { fieldId: 'tiene_alergias', value: true },
        educationalNote: 'Diferencia estrictamente si sufriste dificultad respiratoria (alergia real) o solo malestar digestivo (efecto adverso).',
      },
    ],
  },

  // PASO 7: Antecedentes familiares
  {
    id: 'antecedentes_familiares',
    title: '👨‍👩‍👧‍👦 Tu Historia Familiar: El Código Genético',
    subtitle: 'Las enfermedades de tu familia son pistas de tu futuro',
    category: 'antecedentes_familiares',
    completed: false,
    story: {
      intro: 'Tu genética establece predisposiciones estructurales y metabólicas. Tu historial familiar revela riesgos clínicos antes de que se manifiesten.',
      why: 'Ciertas patologías oncológicas y cardiovasculares tienen un fuerte componente hereditario, lo que justifica adelantar los estudios de tamizaje.',
      example: 'Un historial paterno de infarto antes de los 55 años duplica tu propio riesgo, exigiendo controles de colesterol mucho más estrictos.',
      didYouKnow: 'Heredar el riesgo no garantiza la enfermedad, pero indica a tu médico de forma estadística qué sistemas orgánicos deben monitorearse.',
    },
    fields: [
      {
        id: 'padre_vivo',
        type: 'boolean',
        label: '¿Tu padre está vivo?',
        required: true,
      },
      {
        id: 'padre_edad',
        type: 'number',
        label: 'Edad actual de tu padre',
        placeholder: 'Ejemplo: 65',
        required: false,
        dependsOn: { fieldId: 'padre_vivo', value: true },
        validation: { min: 0, max: 120 },
      },
      {
        id: 'padre_enfermedades',
        type: 'multiselect',
        label: 'Enfermedades de tu padre (vivo o fallecido)',
        required: false,
        options: [
          { value: 'diabetes', label: 'Diabetes', explanation: 'Eleva sustancialmente tu predisposición a resistencia a la insulina.' },
          { value: 'hipertension', label: 'Presión alta', explanation: 'Requiere monitoreo cardiovascular preventivo.' },
          { value: 'infarto', label: 'Infarto cardíaco', explanation: 'Alerta clínica, especialmente si ocurrió antes de los 55 años.' },
          { value: 'cancer', label: 'Cáncer (especificar tipo abajo)', explanation: 'Puede requerir tamizaje genético temprano.' },
          { value: 'colesterol_alto', label: 'Colesterol alto familiar', explanation: 'Indica riesgo prematuro de aterosclerosis.' },
          { value: 'ninguna', label: 'Ninguna enfermedad conocida', explanation: 'Sin predisposición patológica paterna conocida.' },
        ],
      },
      {
        id: 'padre_causa_muerte',
        type: 'text',
        label: '¿De qué falleció tu padre? (si aplica)',
        placeholder: 'Ejemplo: Infarto cardíaco a los 52 años',
        required: false,
        dependsOn: { fieldId: 'padre_vivo', value: false },
      },
      {
        id: 'madre_viva',
        type: 'boolean',
        label: '¿Tu madre está viva?',
        required: true,
      },
      {
        id: 'madre_edad',
        type: 'number',
        label: 'Edad actual de tu madre',
        placeholder: 'Ejemplo: 62',
        required: false,
        dependsOn: { fieldId: 'madre_viva', value: true },
        validation: { min: 0, max: 120 },
      },
      {
        id: 'madre_enfermedades',
        type: 'multiselect',
        label: 'Enfermedades de tu madre (viva o fallecida)',
        required: false,
        options: [
          { value: 'diabetes', label: 'Diabetes', explanation: 'Eleva sustancialmente tu predisposición metabólica.' },
          { value: 'hipertension', label: 'Presión alta', explanation: 'Requiere monitoreo cardiovascular preventivo.' },
          { value: 'cancer_mama', label: 'Cáncer de mama', explanation: 'Exige protocolo de detección oncológica precoz (gen BRCA).' },
          { value: 'cancer_ovario', label: 'Cáncer de ovario', explanation: 'Marcador crítico de síndromes hereditarios.' },
          { value: 'osteoporosis', label: 'Osteoporosis', explanation: 'Aumenta el riesgo de deterioro de densidad ósea.' },
          { value: 'tiroides', label: 'Problemas de tiroides', explanation: 'Sugiere susceptibilidad a disfunciones endocrinas.' },
          { value: 'ninguna', label: 'Ninguna enfermedad conocida', explanation: 'Sin predisposición patológica materna conocida.' },
        ],
      },
      {
        id: 'madre_causa_muerte',
        type: 'text',
        label: '¿De qué falleció tu madre? (si aplica)',
        placeholder: 'Ejemplo: Cáncer de mama a los 58 años',
        required: false,
        dependsOn: { fieldId: 'madre_viva', value: false },
      },
      {
        id: 'hermanos_enfermedades',
        type: 'multiselect',
        label: '¿Tus hermanos tienen alguna de estas condiciones?',
        required: false,
        options: [
          { value: 'diabetes', label: 'Diabetes tipo 1 o 2', explanation: 'Señala una alta penetrancia genética familiar.' },
          { value: 'cancer_joven', label: 'Cáncer antes de 50 años', explanation: 'Marcador primario de mutaciones oncológicas hereditarias.' },
          { value: 'enfermedad_mental', label: 'Depresión o trastorno bipolar', explanation: 'Indica vulnerabilidad neuroquímica compartida.' },
          { value: 'autoinmune', label: 'Enfermedad autoinmune', explanation: 'Sugiere desregulación inmunológica familiar.' },
          { value: 'no_hermanos', label: 'No tengo hermanos', explanation: 'Historial no aplicable.' },
          { value: 'ninguna', label: 'Ninguna enfermedad conocida', explanation: 'Sin predisposición compartida conocida.' },
        ],
      },
    ],
  },

  // PASO 8: Hábitos
  {
    id: 'habitos',
    title: '🏃‍♂️ Tus Hábitos: Lo Que Haces Cada Día',
    subtitle: 'Tu estilo de vida determina el 70% de tu salud futura',
    category: 'antecedentes_personales',
    completed: false,
    story: {
      intro: 'Tus rutinas diarias moldean tu pronóstico de salud con mayor fuerza que tu genética. Las decisiones crónicas dejan marcas biológicas.',
      why: 'El tabaquismo, la dieta y el nivel de actividad física influyen directamente en la inflamación sistémica y el daño endotelial a largo plazo.',
      example: 'El consumo crónico de ultraprocesados altera tu microbiota y sensibilidad a la insulina, pavimentando el camino al síndrome metabólico.',
      didYouKnow: 'En cardiología preventiva, el sedentarismo absoluto genera un daño cardiovascular estadísticamente comparable al consumo leve de tabaco.',
    },
    fields: [
      {
        id: 'fuma',
        type: 'select',
        label: '¿Fumas o has fumado?',
        required: true,
        options: [
          { value: 'nunca', label: 'Nunca he fumado', explanation: 'Riesgo respiratorio y endotelial basal mínimo.' },
          { value: 'exfumador', label: 'Fumé antes, ya dejé', explanation: 'Reversión progresiva de daño celular acumulado.' },
          { value: 'actual', label: 'Sí, fumo actual mente', explanation: 'Factor causal primario de mutagénesis e isquemia.' },
        ],
      },
      {
        id: 'cigarrillos_dia',
        type: 'number',
        label: '¿Cuántos cigarrillos fumas por día?',
        placeholder: 'Ejemplo: 10',
        required: false,
        dependsOn: { fieldId: 'fuma', value: 'actual' },
        validation: { min: 0, max: 100 },
        educationalNote: 'El daño endotelial es proporcional a la carga tóxica. El cálculo de "paquetes-año" define tu riesgo oncológico.',
      },
      {
        id: 'años_fumando',
        type: 'number',
        label: '¿Cuántos años llevas fumando o fumaste?',
        placeholder: 'Ejemplo: 15',
        required: false,
        dependsOn: { fieldId: 'fuma', value: 'actual' },
        validation: { min: 0, max: 80 },
        tooltip: 'Variable crítica para determinar tu índice de riesgo respiratorio crónico.',
      },
      {
        id: 'alcohol',
        type: 'select',
        label: '¿Consumes bebidas alcohólicas?',
        required: true,
        options: [
          { value: 'nunca', label: 'No bebo alcohol', explanation: 'Hígado exento de estrés metabólico por etanol.' },
          { value: 'ocasional', label: 'Ocasional (1-2 veces al mes)', explanation: 'Impacto hepático estadísticamente marginal.' },
          { value: 'moderado', label: 'Moderado (1-2 veces por semana)', explanation: 'Carga metabólica dentro de umbrales tolerables.' },
          { value: 'frecuente', label: 'Frecuente (3-6 veces por semana)', explanation: 'Inflamación subclínica y riesgo orgánico sostenido.' },
          { value: 'diario', label: 'Diario', explanation: 'Toxicidad celular crónica y riesgo alto de cirrosis.' },
        ],
      },
      {
        id: 'ejercicio',
        type: 'select',
        label: '¿Haces ejercicio regularmente?',
        required: true,
        options: [
          { value: 'sedentario', label: 'No, soy sedentario', explanation: 'Deterioro vascular equivalente al consumo leve de tabaco.' },
          { value: 'ligero', label: 'Ligero (caminar 30 min, 1-2 veces/semana)', explanation: 'Mitigación parcial de atrofia sistémica.' },
          { value: 'moderado', label: 'Moderado (30-60 min, 3-4 veces/semana)', explanation: 'Rendimiento basal óptimo para salud circulatoria.' },
          { value: 'intenso', label: 'Intenso (>60 min, 5+ veces/semana)', explanation: 'Prevención máxima contra el síndrome metabólico.' },
        ],
      },
      {
        id: 'horas_sueno',
        type: 'scale',
        label: '¿Cuántas horas duermes por noche normalmente?',
        required: true,
        validation: { min: 1, max: 12 },
        tooltip: 'La privación crónica (<6h) induce resistencia a la insulina y aceleración del deterioro cognitivo.',
      },
      {
        id: 'dieta',
        type: 'select',
        label: '¿Cómo describirías tu alimentación?',
        required: true,
        options: [
          { value: 'muy_mala', label: 'Comida rápida y ultra-procesados frecuentemente', explanation: 'Catabolismo alto; vía directa a patologías crónicas.' },
          { value: 'regular', label: 'Mezcla de procesados y comida casera', explanation: 'Aporte de nutrientes subóptimo pero funcional.' },
          { value: 'buena', label: 'Principalmente comida casera, balanceada', explanation: 'Regulación metabólica y baja inflamación sistémica.' },
          { value: 'excelente', label: 'Dieta mediterránea, muchas verduras y frutas', explanation: 'Protección celular demostrada por medicina preventiva.' },
        ],
      },
    ],
  },

  // PASO 9: Cardiovascular
  {
    id: 'cardiovascular',
    title: '❤️ Sistema Cardiovascular',
    subtitle: 'Tu corazón y circulación: el motor de la vida',
    category: 'revision_sistemas',
    completed: false,
    story: {
      intro: 'El sistema circulatorio suele emitir advertencias sutiles antes de fallar. Identificarlas a tiempo frena el daño tisular irreversible.',
      why: 'La fatiga prematura, edemas en las piernas o variaciones del ritmo cardíaco delatan una disfunción en la mecánica de bombeo sistémico.',
      example: 'Una presión opresiva en el pecho al hacer esfuerzo físico indica isquemia, requiriendo evaluación coronaria inmediata.',
      didYouKnow: 'El fenotipo isquémico varía por sexo. En mujeres, el infarto frecuentemente se presenta como agotamiento extremo, sin dolor torácico.',
    },
    fields: [
      {
        id: 'dolor_pecho',
        type: 'boolean',
        label: '¿Has tenido dolor o molestia en el pecho?',
        required: true,
      },
      {
        id: 'dolor_pecho_detalle',
        type: 'textarea',
        label: 'Describe el dolor: ¿dónde, cuándo, cómo es?',
        placeholder: 'Ejemplo: Dolor en centro del pecho, opresivo, cuando subo escaleras, se va con reposo',
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
        label: '¿Sientes que tu corazón late rápido o irregular?',
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
        label: '¿Has experimentado alguno de estos síntomas?',
        required: false,
        options: [
          { value: 'mareos', label: 'Mareos o desmayos', explanation: 'Sugiere deficiencias en perfusión cerebral o arritmias.' },
          { value: 'sudoracion', label: 'Sudoración fría sin razón', explanation: 'Respuesta del sistema simpático a isquemia miocárdica.' },
          { value: 'fatiga_extrema', label: 'Cansancio extremo inexplicable', explanation: 'Signo clínico temprano de disfunción de bombeo ventricular.' },
          { value: 'tos_nocturna', label: 'Tos al acostarse', explanation: 'Indica congestión pulmonar por estancamiento vascular.' },
          { value: 'ninguno', label: 'Ninguno de estos', explanation: 'Ausencia de sintomatología vascular periférica.' },
        ],
      },
    ],
  },

  // PASO 10: Respiratorio
  {
    id: 'respiratorio',
    title: '🫁 Sistema Respiratorio',
    subtitle: 'Tus pulmones: la fábrica de oxígeno',
    category: 'revision_sistemas',
    completed: false,
    story: {
      intro: 'Tus pulmones compensan el daño de forma silenciosa. Reconocer síntomas respiratorios tempranos evita complicaciones severas.',
      why: 'Desestimar una tos crónica o la dificultad para respirar retrasa intervenciones críticas en casos de asma, fibrosis o tumores incipientes.',
      example: 'Una tos persistente por más de tres semanas nunca es habitual en un adulto sano y exige descartar patologías pulmonares crónicas.',
      didYouKnow: 'La apnea del sueño severa (pausas respiratorias al dormir) dispara la hipertensión y multiplica por tres tu riesgo de derrame cerebral.',
    },
    fields: [
      {
        id: 'tos',
        type: 'boolean',
        label: '¿Tienes tos persistente (más de 3 semanas)?',
        required: true,
      },
      {
        id: 'tos_detalle',
        type: 'textarea',
        label: 'Describe tu tos: ¿seca o con flema? ¿Cuándo es peor?',
        placeholder: 'Ejemplo: Tos seca por las noches, me despierta, llevo 5 semanas',
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
        label: '¿Escuchas silbidos en el pecho al respirar?',
        required: true,
        tooltip: 'La sibilancia denota broncoconstricción o edema de las vías aéreas bajas.',
      },
      {
        id: 'sintomas_respiratorios',
        type: 'multiselect',
        label: '¿Has experimentado alguno de estos síntomas?',
        required: false,
        options: [
          { value: 'sangre_tos', label: 'Sangre al toser', explanation: 'Hallazgo crítico; exige descartar hemorragia o neoplasia pulmonar.' },
          { value: 'dolor_respirar', label: 'Dolor al respirar profundo', explanation: 'Sugiere inflamación de la pleura o infección alveolar.' },
          { value: 'ronquidos', label: 'Ronquidos fuertes con pausas', explanation: 'Indicador primario de hipoxia nocturna y riesgo de apoplejía.' },
          { value: 'flema_color', label: 'Flema amarilla o verde persistente', explanation: 'Correlacionado con procesos infecciosos bacterianos activos.' },
          { value: 'ninguno', label: 'Ninguno de estos', explanation: 'Ausencia de alarma en tracto respiratorio inferior.' },
        ],
      },
    ],
  },

  // PASO 11: Digestivo
  {
    id: 'digestivo',
    title: '🍽️ Sistema Digestivo',
    subtitle: 'De la boca al ano: tu fábrica de nutrientes',
    category: 'revision_sistemas',
    completed: false,
    story: {
      intro: 'El tracto gastrointestinal reacciona tanto al estrés como a patologías severas. Sus alteraciones crónicas exigen revisión clínica.',
      why: 'Desórdenes como acidez constante o cambios repentinos en el hábito intestinal ocultan desde intolerancias hasta neoplasias tempranas.',
      example: 'La pérdida de peso involuntaria sumada a una acidez refractaria es una señal de alerta médica que obliga a descartar patologías malignas.',
      didYouKnow: 'El uso prolongado y sin supervisión de protectores gástricos puede enmascarar síntomas críticos y alterar tu absorción de nutrientes.',
    },
    fields: [
      {
        id: 'acidez',
        type: 'boolean',
        label: '¿Tienes acidez o reflujo frecuente?',
        required: true,
      },
      {
        id: 'dolor_abdominal',
        type: 'boolean',
        label: '¿Tienes dolor abdominal persistente?',
        required: true,
      },
      {
        id: 'cambio_habito_intestinal',
        type: 'select',
        label: '¿Has tenido cambios en tus hábitos intestinales?',
        required: true,
        options: [
          { value: 'no', label: 'No, todo normal', explanation: 'Tránsito digestivo y absorción conservados.' },
          { value: 'diarrea', label: 'Diarrea frecuente', explanation: 'Alteración de la microbiota o posible mala absorción.' },
          { value: 'estrenimiento', label: 'Estreñimiento', explanation: 'Enlentecimiento del vaciado, factor de riesgo anatómico si es súbito.' },
          { value: 'alternante', label: 'Alterno entre diarrea y estreñimiento', explanation: 'Clásico patrón de inflamación intestinal crónica o funcional.' },
        ],
      },
      {
        id: 'sintomas_digestivos',
        type: 'multiselect',
        label: '¿Has experimentado alguno de estos síntomas?',
        required: false,
        options: [
          { value: 'sangre_heces', label: 'Sangre en las heces', explanation: 'Emergencia clínica; indica sangrado del tracto gastrointestinal inferior.' },
          { value: 'heces_negras', label: 'Heces negras como alquitrán', explanation: 'Emergencia clínica; denota hemorragia digestiva alta (melena).' },
          { value: 'perdida_peso', label: 'Pérdida de peso sin hacer dieta', explanation: 'Marcador oncológico o metabólico de alta prioridad.' },
          { value: 'dificultad_tragar', label: 'Dificultad para tragar', explanation: 'Posible obstrucción esofágica o trastorno de motilidad neurológica.' },
          { value: 'nausea_vomito', label: 'Náusea o vómito persistente', explanation: 'Refleja intolerancia aguda, inflamación gástrica o desorden central.' },
          { value: 'hinchazon', label: 'Hinchazón abdominal constante', explanation: 'Signo de fermentación bacteriana atípica o enfermedad celíaca.' },
          { value: 'ninguno', label: 'Ninguno de estos', explanation: 'Ausencia de banderas rojas gastrointestinales.' },
        ],
      },
    ],
  },

  // PASO 12: Genitourinario
  {
    id: 'genitourinario',
    title: '💧 Sistema Genitourinario',
    subtitle: 'Riñones y vías urinarias: tu sistema de filtración',
    category: 'revision_sistemas',
    completed: false,
    story: {
      intro: 'Tus riñones y vías urinarias son sistemas de alta precisión. Cambios en la excreción revelan disfunciones metabólicas u oncológicas.',
      why: 'Ignorar el aumento de frecuencia urinaria o dolor pélvico retrasa el diagnóstico de infecciones crónicas, diabetes o daños prostáticos.',
      example: 'La nicturia (levantarse múltiples veces en la noche a orinar) en hombres requiere descartar hipertrofia o alteraciones prostáticas.',
      didYouKnow: 'Tus riñones pueden perder hasta el 50% de su capacidad biológica de filtración celular sin generar síntomas físicos evidentes.',
    },
    fields: [
      {
        id: 'dolor_orinar',
        type: 'boolean',
        label: '¿Tienes dolor o ardor al orinar?',
        required: true,
      },
      {
        id: 'frecuencia_urinaria',
        type: 'select',
        label: '¿Has notado cambios en la frecuencia al orinar?',
        required: true,
        options: [
          { value: 'normal', label: 'No, todo normal', explanation: 'Capacidad de retención y filtrado renal fisiológicos.' },
          { value: 'frecuente_dia', label: 'Orino muy frecuente durante el día', explanation: 'Signo primario de poliuria; sugiere hiperglucemia o fallas de concentración.' },
          { value: 'frecuente_noche', label: 'Me levanto muchas veces en la noche', explanation: 'Marcador de estancamiento de fluidos o crecimiento prostático obstructivo.' },
          { value: 'urgencia', label: 'Urgencia súbita (casi no llego)', explanation: 'Sugiere disfunción muscular de la vejiga o infección bacteriana aguda.' },
        ],
      },
      {
        id: 'sintomas_genitourinarios',
        type: 'multiselect',
        label: '¿Has experimentado alguno de estos síntomas?',
        required: false,
        options: [
          { value: 'sangre_orina', label: 'Sangre en la orina', explanation: 'Alerta clínica insoslayable; requiere descartar daño renal o tumor uroepitelial.' },
          { value: 'chorro_debil', label: 'Chorro urinario débil o entrecortado', explanation: 'Indica obstrucción mecánica del flujo de salida, usualmente prostática.' },
          { value: 'incontinencia', label: 'Pérdida involuntaria de orina', explanation: 'Déficit de esfínteres, tratable con intervención urológica.' },
          { value: 'dolor_lumbar', label: 'Dolor en la espalda baja (zona riñones)', explanation: 'Sugiere inflamación del parénquima renal o litiasis (cálculos).' },
          { value: 'ninguno', label: 'Ninguno de estos', explanation: 'Ausencia de anomalías en tracto urogenital.' },
        ],
      },
    ],
  },

  // PASO 13: Resumen final
  {
    id: 'resumen_final',
    title: '✅ ¡Completaste tu Anamnesis!',
    subtitle: 'Resumen de tu historia clínica interactiva',
    category: 'revision_sistemas',
    completed: false,
    story: {
      intro: 'La recopilación de tus datos estructura tu perfil clínico empírico. Es la base sobre la cual el médico construirá su hipótesis diagnóstica.',
      why: 'La medicina basada en evidencia demuestra que una historia clínica detallada reduce los sesgos cognitivos y agiliza el tratamiento eficaz.',
      example: 'Conocer tus hábitos, genética y síntomas previos permite a tu médico priorizar las pruebas de laboratorio que son verdaderamente útiles.',
      didYouKnow: 'Al documentar esta información previamente, maximizas el tiempo de tu consulta para discutir soluciones reales, no para recabar datos.',
    },
    fields: [
      {
        id: 'confirma_informacion',
        type: 'boolean',
        label: '¿Confirmas que toda la información proporcionada es correcta?',
        required: true,
        tooltip: 'La omisión de factores críticos invalida la eficacia clínica de tus resultados empíricos.',
      },
      {
        id: 'comentarios_adicionales',
        type: 'textarea',
        label: '¿Hay algo más que quieras que tu médico sepa?',
        placeholder: 'Ejemplo: Tengo mucho miedo a las agujas, preferencia por doctora mujer, cualquier otra información relevante...',
        required: false,
      },
    ],
  },
];
