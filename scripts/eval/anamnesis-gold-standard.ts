/**
 * Gold Standard Dataset para evaluacion de extraccion de anamnesis.
 *
 * Cada caso tiene input (sections) y expected output (campos clave de AnamnesisExtractionResult).
 * Los datos son ficticios pero clinicamente realistas en espanol.
 *
 * Uso: importar desde run-anamnesis-eval.ts o tests
 */

import type {
  AnamnesisExtractionResult,
  AnamnesisSectionRecord,
} from '../../apps/web/src/lib/patients/types/anamnesis-extraction'

export interface GoldStandardCase {
  id: string
  name: string
  tags: string[]
  patientLabel: string
  sections: AnamnesisSectionRecord[]
  /** Campos clave esperados — no necesariamente el resultado completo */
  expected: DeepPartial<AnamnesisExtractionResult>
  /** Terminos clave que DEBEN aparecer en clinicalNarrative */
  narrativeKeyTerms: string[]
}

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P]
}

export const GOLD_STANDARD: GoldStandardCase[] = [
  // ──────────────────────────────────────────────
  // CASO 1: Agudo simple — cefalea tensional, joven, sin comorbilidades
  // ──────────────────────────────────────────────
  {
    id: 'acute-headache-young',
    name: 'Cefalea tensional aguda en joven sin comorbilidades',
    tags: ['headache', 'acute', 'young', 'simple'],
    patientLabel: 'Lucia Fernandez',
    sections: [
      {
        section: 'filiacion',
        data: {
          fecha_nacimiento: '2000-06-12',
          ocupacion_actual: 'Estudiante de ingenieria',
          anos_en_puesto: 4,
          tipo_trabajo: 'sedentario',
          exposiciones_laborales: 'Pantalla 8 hs/dia, epoca de examenes',
        },
        completed: true,
      },
      {
        section: 'motivo_consulta',
        data: {
          motivo_principal: 'Dolor de cabeza',
          descripcion_detallada:
            'Hace una semana que me duele la cabeza todos los dias, sobre todo a la tarde. Es como una presion en la frente y las sienes. Estoy en epoca de finales y duermo poco.',
          desde_cuando: '1 semana',
          intentos_previos: 'Tome paracetamol 500mg y me calma un rato.',
        },
        completed: true,
      },
      {
        section: 'antecedentes_personales',
        data: {
          enfermedades_previas: 'Ninguna',
          cirugias: 'Ninguna',
          internaciones: 'Nunca',
        },
        completed: true,
      },
      {
        section: 'medicamentos',
        data: {
          toma_medicamentos: false,
          lista_medicamentos: '',
          automedicacion: 'Paracetamol 500mg cuando me duele mucho, 1 vez por dia.',
        },
        completed: true,
      },
      {
        section: 'alergias',
        data: { tiene_alergias: false, lista_alergias: '' },
        completed: true,
      },
      {
        section: 'antecedentes_familiares',
        data: {
          padre: 'Vivo, 52 anos, sano.',
          madre: 'Viva, 50 anos, sana.',
          hermanos: 'Un hermano, 22, sano.',
          enfermedades_familiares: 'Ninguna relevante.',
        },
        completed: true,
      },
      {
        section: 'habitos',
        data: {
          tabaco: 'No fumo.',
          alcohol: 'Social, fines de semana.',
          cafe: '2 tazas por dia.',
          actividad_fisica: 'Corro 3 veces por semana, pero hace un mes que no por los finales.',
          sueno: '4-5 horas por los examenes.',
          alimentacion: 'Irregular, mucho delivery.',
        },
        completed: true,
      },
      {
        section: 'cardiovascular',
        data: { dolor_pecho: false, palpitaciones: false, disnea_esfuerzo: false, edemas: false, sincope: false },
        completed: true,
      },
      {
        section: 'respiratorio',
        data: { tos: false, expectoracion: false, disnea: false, sibilancias: false },
        completed: true,
      },
      {
        section: 'digestivo',
        data: { nauseas: false, vomitos: false, acidez: false, dolor_abdominal: false, cambio_habito_intestinal: false },
        completed: true,
      },
      {
        section: 'genitourinario',
        data: { disuria: false, hematuria: false, frecuencia_urinaria: 'normal', ciclo_menstrual: 'Regular, cada 28 dias.' },
        completed: true,
      },
    ],
    expected: {
      normalizedOpenFields: {
        ageMonths: 309, // ~25 anos
        occupationCategory: 'student',
        chiefComplaintCode: 'headache',
        medicationFamilies: ['analgesic_antipyretic'],
        allergyGroups: [],
        fatherDeathCause: 'alive',
        motherDeathCause: 'alive',
        chestPainPhenotype: null,
        coughPhenotype: null,
        redFlagCodes: [],
      },
      chiefComplaint: {
        contextualMismatch: false,
      },
      safetyFlags: [], // caso simple, no deberia haber flags criticos
    },
    narrativeKeyTerms: ['cefalea', 'presion', 'frente', 'sienes', 'paracetamol', 'examenes', 'semana'],
  },

  // ──────────────────────────────────────────────
  // CASO 2: Cronico con polifarmacia — HTA + DBT2 + multiples medicamentos
  // ──────────────────────────────────────────────
  {
    id: 'chronic-polypharmacy',
    name: 'Paciente cronico con HTA, DBT2 y polifarmacia',
    tags: ['chronic', 'polypharmacy', 'hypertension', 'diabetes', 'elderly'],
    patientLabel: 'Roberto Diaz',
    sections: [
      {
        section: 'filiacion',
        data: {
          fecha_nacimiento: '1958-11-03',
          ocupacion_actual: 'Jubilado, ex-mecanico automotor',
          anos_en_puesto: 35,
          tipo_trabajo: 'manual',
          exposiciones_laborales: 'Aceites, solventes, ruido',
        },
        completed: true,
      },
      {
        section: 'motivo_consulta',
        data: {
          motivo_principal: 'Control, me siento cansado',
          descripcion_detallada:
            'Vengo al control de mi presion y azucar. Pero hace como 2 meses que me siento mas cansado que de costumbre, me agito subiendo escaleras. A veces me mareo un poco al levantarme rapido.',
          desde_cuando: '2 meses',
          intentos_previos: 'Nada, pense que era la edad.',
        },
        completed: true,
      },
      {
        section: 'antecedentes_personales',
        data: {
          enfermedades_previas: 'Hipertension arterial hace 12 anos. Diabetes tipo 2 hace 8 anos. Dislipemia. Gota hace 3 anos.',
          cirugias: 'Hernia inguinal derecha 2010. Colecistectomia 2018.',
          internaciones: 'Una vez por crisis hipertensiva en 2019.',
        },
        completed: true,
      },
      {
        section: 'medicamentos',
        data: {
          toma_medicamentos: true,
          lista_medicamentos:
            'Losartan 50mg 2 veces por dia. Amlodipina 5mg 1 vez por dia. Metformina 850mg 2 veces por dia despues de comer. Atorvastatina 20mg a la noche. Alopurinol 300mg 1 vez por dia. Aspirina 100mg 1 vez por dia.',
          automedicacion: 'A veces tomo un omeprazol si me cae mal la comida.',
        },
        completed: true,
      },
      {
        section: 'alergias',
        data: {
          tiene_alergias: true,
          lista_alergias: 'Sulfonamidas: me salieron ronchas generalizadas hace muchos anos.',
        },
        completed: true,
      },
      {
        section: 'antecedentes_familiares',
        data: {
          padre: 'Fallecido a los 70 de ACV.',
          madre: 'Fallecida a los 82, tenia diabetes y Alzheimer.',
          hermanos: 'Dos hermanos: uno hipertenso (65), otro sano (60).',
          enfermedades_familiares: 'Padre ACV, madre diabetica, hermano hipertenso. Tio paterno infarto a los 55.',
        },
        completed: true,
      },
      {
        section: 'habitos',
        data: {
          tabaco: 'Fume 20 cigarrillos por dia desde los 18 hasta los 55. Deje hace 9 anos.',
          alcohol: 'Antes tomaba vino todos los dias. Ahora solo fines de semana, un vaso.',
          cafe: '2 tazas por dia.',
          actividad_fisica: 'Camino 20 minutos por dia. Antes nada.',
          sueno: '7 horas, me despierto 2 veces para ir al bano.',
          alimentacion: 'Dieta hipohidrocarbonada. Trato de cuidarme pero a veces me tienta.',
        },
        completed: true,
      },
      {
        section: 'cardiovascular',
        data: {
          dolor_pecho: false,
          palpitaciones: false,
          disnea_esfuerzo: true,
          edemas: false,
          sincope: false,
          observaciones: 'Me agito subiendo 2 pisos de escalera. Antes no me pasaba.',
        },
        completed: true,
      },
      {
        section: 'respiratorio',
        data: { tos: false, expectoracion: false, disnea: false, sibilancias: false },
        completed: true,
      },
      {
        section: 'digestivo',
        data: {
          nauseas: false,
          vomitos: false,
          acidez: true,
          dolor_abdominal: false,
          cambio_habito_intestinal: false,
          observaciones: 'Acidez esporadica, la relaciono con comidas pesadas.',
        },
        completed: true,
      },
      {
        section: 'genitourinario',
        data: {
          disuria: false,
          hematuria: false,
          frecuencia_urinaria: 'aumentada nocturia 2 veces',
          ciclo_menstrual: 'N/A',
        },
        completed: true,
      },
    ],
    expected: {
      normalizedOpenFields: {
        ageMonths: 808, // ~67 anos
        occupationCategory: 'retired',
        chiefComplaintCode: 'fatigue',
        medicationFamilies: ['antihypertensive_arb', 'antidiabetic_oral', 'ppi'],
        allergyGroups: ['other'],
        fatherDeathCause: 'stroke',
        motherDeathCause: 'other', // Alzheimer no tiene codigo exacto
        chestPainPhenotype: null,
        coughPhenotype: null,
        redFlagCodes: [],
      },
      chiefComplaint: {
        contextualMismatch: true, // dice "control" pero la queja real es fatiga + disnea
      },
      safetyFlags: [], // adherencia irregular no es mencionada, pero polifarmacia es relevante
    },
    narrativeKeyTerms: ['cansancio', 'disnea', 'escaleras', 'mareo', 'hipertension', 'diabetes', 'losartan', 'metformina'],
  },

  // ──────────────────────────────────────────────
  // CASO 3: Red flags — dolor toracico con features de alarma
  // ──────────────────────────────────────────────
  {
    id: 'chest-pain-red-flags',
    name: 'Dolor toracico con multiples banderas rojas',
    tags: ['chest_pain', 'red_flags', 'emergency', 'cardiac'],
    patientLabel: 'Carlos Mendez',
    sections: [
      {
        section: 'filiacion',
        data: {
          fecha_nacimiento: '1969-04-22',
          ocupacion_actual: 'Chofer de taxi',
          anos_en_puesto: 20,
          tipo_trabajo: 'sedentario',
          exposiciones_laborales: 'Estres de transito, sedentarismo prolongado',
        },
        completed: true,
      },
      {
        section: 'motivo_consulta',
        data: {
          motivo_principal: 'Dolor en el pecho',
          descripcion_detallada:
            'Ayer a la tarde estaba caminando rapido para tomar el colectivo y me agarro un dolor fuerte en el pecho, como que me apretaban. Me faltaba el aire, transpire frio. Me tuve que sentar. Duro como 10 minutos y despues aflojo. Hoy me volvio a pasar subiendo la escalera del edificio, menos fuerte, como 5 minutos.',
          desde_cuando: '1 dia',
          intentos_previos: 'Nada, me asuste y vine.',
        },
        completed: true,
      },
      {
        section: 'antecedentes_personales',
        data: {
          enfermedades_previas: 'Presion alta hace 5 anos, no me trato bien. Colesterol alto.',
          cirugias: 'Ninguna',
          internaciones: 'Nunca',
        },
        completed: true,
      },
      {
        section: 'medicamentos',
        data: {
          toma_medicamentos: true,
          lista_medicamentos: 'Me recetaron enalapril 10mg pero hace meses que no lo tomo. Tambien atorvastatina pero tampoco.',
          automedicacion: 'Nada para esto.',
        },
        completed: true,
      },
      {
        section: 'alergias',
        data: { tiene_alergias: false, lista_alergias: '' },
        completed: true,
      },
      {
        section: 'antecedentes_familiares',
        data: {
          padre: 'Fallecido a los 58 de un infarto.',
          madre: 'Viva, 82 anos, hipertensa.',
          hermanos: 'Un hermano, 52, tuvo un stent hace 2 anos.',
          enfermedades_familiares: 'Padre infarto joven. Hermano enfermedad coronaria precoz. Madre HTA.',
        },
        completed: true,
      },
      {
        section: 'habitos',
        data: {
          tabaco: 'Fumo 1 atado por dia hace 30 anos.',
          alcohol: 'Cerveza todos los dias, 2-3 latas.',
          cafe: '4-5 tazas por dia.',
          actividad_fisica: 'Nada. Sentado todo el dia en el taxi.',
          sueno: '5-6 horas, irregular.',
          alimentacion: 'Mucha comida rapida, empanadas, choripan. Como en el auto.',
        },
        completed: true,
      },
      {
        section: 'cardiovascular',
        data: {
          dolor_pecho: true,
          palpitaciones: false,
          disnea_esfuerzo: true,
          edemas: false,
          sincope: false,
          observaciones: 'Dolor opresivo retroesternal con esfuerzo, se irradia al brazo izquierdo. Transpiracion fria acompanante.',
        },
        completed: true,
      },
      {
        section: 'respiratorio',
        data: { tos: true, expectoracion: false, disnea: false, sibilancias: false, observaciones: 'Tos seca matinal, la atribuye al cigarrillo.' },
        completed: true,
      },
      {
        section: 'digestivo',
        data: { nauseas: true, vomitos: false, acidez: false, dolor_abdominal: false, cambio_habito_intestinal: false, observaciones: 'Nauseas durante el episodio de dolor toracico.' },
        completed: true,
      },
      {
        section: 'genitourinario',
        data: { disuria: false, hematuria: false, frecuencia_urinaria: 'normal' },
        completed: true,
      },
    ],
    expected: {
      normalizedOpenFields: {
        ageMonths: 683, // ~56 anos
        occupationCategory: 'commerce_service',
        chiefComplaintCode: 'chest_pain',
        medicationFamilies: ['antihypertensive_ace'],
        allergyGroups: [],
        fatherDeathCause: 'myocardial_infarction',
        motherDeathCause: 'alive',
        chestPainPhenotype: 'oppressive',
        coughPhenotype: 'dry',
        redFlagCodes: ['chest_pain_exertional', 'dyspnea_at_rest'],
      },
      chiefComplaint: {
        contextualMismatch: false,
      },
      // No evaluamos safetyFlags por Jaccard (son texto libre, nunca match exacto).
      // Se evaluan via narrativeKeyTerms y manual review.
    },
    narrativeKeyTerms: [
      'opresivo', 'retroesternal', 'esfuerzo', 'brazo izquierdo',
      'transpiracion', 'disnea', 'tabaquismo', 'enalapril', 'adherencia',
    ],
  },

  // ──────────────────────────────────────────────
  // CASO 4: Salud reproductiva / ginecologico
  // ──────────────────────────────────────────────
  {
    id: 'reproductive-health',
    name: 'Mujer joven con sintomas genitourinarios y anticonceptivos',
    tags: ['reproductive', 'genitourinary', 'young', 'contraceptive'],
    patientLabel: 'Valentina Rojas',
    sections: [
      {
        section: 'filiacion',
        data: {
          fecha_nacimiento: '1996-08-20',
          ocupacion_actual: 'Disenadora grafica freelance',
          anos_en_puesto: 5,
          tipo_trabajo: 'sedentario',
          exposiciones_laborales: 'Pantalla prolongada',
        },
        completed: true,
      },
      {
        section: 'motivo_consulta',
        data: {
          motivo_principal: 'Molestias al orinar y dolor abdominal bajo',
          descripcion_detallada:
            'Hace 4 dias me empezo a arder al hacer pis. Voy muchas veces al bano pero sale poco. Tambien me duele abajo de la panza, como tipo calambres. No tengo fiebre. Pense que se me iba a pasar pero no mejoro.',
          desde_cuando: '4 dias',
          intentos_previos: 'Tome mucha agua y jugo de arandanos.',
        },
        completed: true,
      },
      {
        section: 'antecedentes_personales',
        data: {
          enfermedades_previas: 'Infecciones urinarias a repeticion, 3 en el ultimo ano. Anemia ferropenica tratada el ano pasado.',
          cirugias: 'Ninguna',
          internaciones: 'Nunca',
        },
        completed: true,
      },
      {
        section: 'medicamentos',
        data: {
          toma_medicamentos: true,
          lista_medicamentos: 'Anticonceptivos orales combinados (levonorgestrel + etinilestradiol) hace 3 anos. Hierro bisglicinato 30mg/dia.',
          automedicacion: 'Ibuprofeno para los calambres menstruales.',
        },
        completed: true,
      },
      {
        section: 'alergias',
        data: {
          tiene_alergias: true,
          lista_alergias: 'Mariscos: me broto toda la cara y cuello. No fue grave pero desde entonces no como.',
        },
        completed: true,
      },
      {
        section: 'antecedentes_familiares',
        data: {
          padre: 'Vivo, 58, sano.',
          madre: 'Viva, 55, hipotiroidea.',
          hermanos: 'Una hermana, 32, sana.',
          enfermedades_familiares: 'Madre hipotiroidea. Abuela materna cancer de mama a los 65.',
        },
        completed: true,
      },
      {
        section: 'habitos',
        data: {
          tabaco: 'No fumo.',
          alcohol: 'Social, fines de semana.',
          cafe: '1 taza por dia.',
          actividad_fisica: 'Yoga 2 veces por semana.',
          sueno: '7-8 horas, bien.',
          alimentacion: 'Vegetariana hace 2 anos.',
        },
        completed: true,
      },
      {
        section: 'cardiovascular',
        data: { dolor_pecho: false, palpitaciones: false, disnea_esfuerzo: false, edemas: false, sincope: false },
        completed: true,
      },
      {
        section: 'respiratorio',
        data: { tos: false, expectoracion: false, disnea: false, sibilancias: false },
        completed: true,
      },
      {
        section: 'digestivo',
        data: { nauseas: false, vomitos: false, acidez: false, dolor_abdominal: true, cambio_habito_intestinal: false, observaciones: 'Dolor hipogastrico tipo calambre, relacionado con la molestia urinaria.' },
        completed: true,
      },
      {
        section: 'genitourinario',
        data: {
          disuria: true,
          hematuria: false,
          frecuencia_urinaria: 'aumentada, polaquiuria',
          ciclo_menstrual: 'Regular bajo ACO. Ultima menstruacion hace 2 semanas.',
          observaciones: 'Ardor al final de la miccion. Urgencia miccional. Sin flujo vaginal anormal.',
        },
        completed: true,
      },
    ],
    expected: {
      normalizedOpenFields: {
        ageMonths: 355, // ~29 anos
        occupationCategory: 'technology',
        chiefComplaintCode: 'genitourinary_symptoms',
        medicationFamilies: ['hormonal_contraceptive', 'nsaid'],
        allergyGroups: ['food_seafood'],
        fatherDeathCause: 'alive',
        motherDeathCause: 'alive',
        chestPainPhenotype: null,
        coughPhenotype: null,
        redFlagCodes: [],
      },
      chiefComplaint: {
        contextualMismatch: false,
      },
      safetyFlags: [],
    },
    narrativeKeyTerms: ['disuria', 'polaquiuria', 'ardor', 'hipogastrio', 'urinaria', 'anticonceptivo'],
  },

  // ──────────────────────────────────────────────
  // CASO 5: Datos incompletos — muchos campos faltantes
  // ──────────────────────────────────────────────
  {
    id: 'incomplete-data',
    name: 'Anamnesis incompleta con datos faltantes multiples',
    tags: ['incomplete', 'missing_data', 'graceful_handling'],
    patientLabel: 'Paciente Anonimo',
    sections: [
      {
        section: 'motivo_consulta',
        data: {
          motivo_principal: 'Me duele la panza',
          descripcion_detallada: 'Desde ayer me duele la panza.',
          desde_cuando: '1 dia',
        },
        completed: true,
      },
      {
        section: 'antecedentes_personales',
        data: {
          enfermedades_previas: 'No se',
          cirugias: '',
          internaciones: '',
        },
        completed: false,
      },
      {
        section: 'medicamentos',
        data: {
          toma_medicamentos: false,
        },
        completed: false,
      },
      // Sin secciones de alergias, antecedentes familiares, habitos, ni revision por sistemas
    ],
    expected: {
      normalizedOpenFields: {
        ageMonths: null,
        occupationCategory: null,
        chiefComplaintCode: 'abdominal_pain',
        medicationFamilies: [],
        allergyGroups: [],
        fatherDeathCause: null,
        motherDeathCause: null,
        chestPainPhenotype: null,
        coughPhenotype: null,
        redFlagCodes: [],
      },
      chiefComplaint: {
        contextualMismatch: false,
      },
      argenteCoverage: {
        // La mayoria de secciones deberian estar en weakOrMissing
        weakOrMissing: [],
      },
      // Con datos tan incompletos, deberia haber muchas preguntas y datos faltantes
      safetyFlags: [],
    },
    narrativeKeyTerms: ['dolor', 'abdominal'],
  },
]
