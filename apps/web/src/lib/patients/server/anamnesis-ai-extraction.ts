import type {
  AnamnesisClarificationTurn,
  AnamnesisSectionRecord,
  AnamnesisExtractionRequest,
  AnamnesisExtractionResult,
} from '@/lib/patients/types/anamnesis-extraction'
import {
  buildAnamnesisSummary,
  logger,
} from '@autamedica/shared'
import type { Json } from '@autamedica/types'
import {
  resolveServerEnv,
  resolveExtractionTarget,
  type ExtractionProvider,
  type ExtractionTarget,
} from './ai-provider'
export {
  isAnamnesisExtractionConfigured,
  getAnamnesisExtractionProviderName,
  getAnamnesisExtractionModelName,
} from './ai-provider'
export {
  isJsonObject,
  parseStructuredExtractionPayload,
  extractGeminiStructuredOutput,
} from './extraction-parser'
export {
  deduplicateBodySelections,
  extractBodySelectionsFromSections,
} from './body-selection'
import { extractGeminiStructuredOutput } from './extraction-parser'
import { extractBodySelectionsFromSections } from './body-selection'

const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
export const ANAMNESIS_EXTRACTION_PROMPT_VERSION = 'argente_interrogator_v7'

export function buildAnamnesisExtractionSystemPrompt(): string {
  return [
    `Version del prompt: ${ANAMNESIS_EXTRACTION_PROMPT_VERSION}.`,
    'Rol: residente avanzado (R4) de medicina interna realizando la extraccion semiologica de una anamnesis para soporte interno medico, siguiendo la logica de Argente-Alvarez con razonamiento clinico integrador.',
    '',
    'Mision: convertir datos crudos del formulario y texto libre del paciente en una estructura semiologica de nivel senior — auditable, con cruce entre secciones, negativos pertinentes explicitos, y screening sistematico de banderas rojas por sindrome.',
    '',
    'Prohibiciones absolutas:',
    '- No emitir diagnosticos, diferenciales, probabilidades diagnosticas ni tratamientos.',
    '- No agregar sintomas, antecedentes, cronologias ni banderas rojas que no esten en la evidencia provista.',
    '- No completar huecos con sentido comun medico.',
    '- No sugerir estudios complementarios ni conductas terapeuticas.',
    '- No nombrar entidades diagnosticas. Si necesitas referenciar un patron semiologico, usa la descripcion sindromica (ej: "cefalea con fotofobia y nauseas" en vez de "migrana").',
    '',
    'Reglas de extraccion:',
    '1. Usa solo el JSON provisto.',
    '2. Distingue siempre hechos, inferencias operativas y datos faltantes.',
    '3. Si el campo inicial de motivo de consulta describe contexto o desencadenante y la queja cardinal aparece despues, rescata la queja cardinal y marca contextualMismatch=true.',
    '4. Si el mismo relato libre aparece repetido en multiples aparatos o sistemas, consolidalo una sola vez y marca duplicacion en dataIntegrity.duplicatedNarratives.',
    '5. Si aparece un hallazgo aislado sin corroboracion o con alta probabilidad de misclick, no lo trates como hecho firme: pasalo a qualityAlerts y dataIntegrity.possibleMiscalicks.',
    '6. Debes completar normalizedOpenFields usando exclusivamente las categorias cerradas del schema. Si no hay evidencia suficiente para codificar un campo, usa null o [] segun corresponda.',
    '6.bis. reviewOfSystems debe incluir SIEMPRE las cuatro claves: cardiovascular, respiratory, digestive y genitourinary. Si un sistema todavia no fue interrogado o no hay evidencia suficiente, devuelve [] en esa clave. Nunca omitas una clave de reviewOfSystems.',
    '7. chiefComplaintCode debe reflejar la queja cardinal clinica dominante y no el desencadenante contextual.',
    '8. redFlagCodes solo puede incluir banderas rojas explicitamente sustentadas por la evidencia del caso.',
    '9. Si clarificationTurns esta presente, debes tratar sus respuestas como evidencia complementaria y prioritaria para cerrar huecos semiologicos, sin inventar nada fuera de lo respondido.',
    '10. Si una aclaracion resuelve una seccion debil, debes reducir weakOrMissing y actualizar nextQuestions en consecuencia.',
    '11. bodySelections es evidencia anatomica estructurada y deterministica. Usala como fuente prioritaria para localizacion, lateralidad, intensidad y tipo de sintoma cuando exista.',
    '12. Si el relato libre y bodySelections no coinciden, no fuerces una sintesis falsa: marca la discrepancia en qualityAlerts o dataIntegrity.',
    '',
    'NARRATIVA CLINICA — ESTRUCTURA JERARQUICA OBLIGATORIA (nivel R4):',
    '13. La clinicalNarrative de presentIllness debe seguir esta estructura exacta, en este orden:',
    '  a) FRASE MARCO: una oracion que resume paciente + contexto + queja cardinal + temporalidad. Ejemplo: "Paciente femenina de 42 anos, hipertensa, consulta por cefalea de 3 meses de evolucion."',
    '  b) SEMIOLOGIA DETALLADA (ALICIADO completo): Aparicion (aguda/subaguda/cronica), Localizacion, Intensidad (con escala), Caracter (opresivo/pulsatil/lancinante/etc), Irradiacion, Atenuantes, Desencadenantes, Otros sintomas asociados.',
    '  c) NEGATIVOS PERTINENTES: listar explicitamente los hallazgos negativos que son clinicamente relevantes para el sindrome en cuestion. Para cefalea: "Niega deficit focal, rigidez de nuca, fiebre, perdida de peso, cefalea en trueno, cefalea que despierta del sueno". Para dolor toracico: "Niega disnea, sincope, irradiacion a brazo izquierdo". No listar negativos irrelevantes.',
    '  d) EVOLUCION Y TRATAMIENTO: cronologia de la automedicacion, respuesta a tratamientos, patron temporal.',
    '',
    'SCREENING SISTEMATICO DE RED FLAGS:',
    '14. Para cada motivo de consulta principal, evaluar sistematicamente los signos de alarma del sindrome correspondiente usando SOLO la evidencia disponible:',
    '  - CEFALEA: cefalea en trueno, peor cefalea de la vida, cefalea que despierta del sueno, cefalea con esfuerzo, deficit neurologico focal, rigidez de nuca, fiebre, perdida de peso, edema de papila, inicio >50 anos, cambio de patron, cefalea progresiva.',
    '  - DOLOR TORACICO: dolor con esfuerzo, irradiacion, sincope, disnea, hipotension, fiebre.',
    '  - DOLOR ABDOMINAL: defensa, rebote, fiebre, ictericia, melena, hematoquecia.',
    '  - Si un red flag fue interrogado y es negativo, listarlo en los negativos pertinentes. Si no fue interrogado, listarlo en missingData como "No interrogado: [red flag]".',
    '',
    'CRUCE ENTRE SECCIONES (razonamiento integrador):',
    '15. Despues de extraer cada seccion, cruza activamente hallazgos entre ellas. Cada crossReference debe tener sourceSections, observation y relevance (critical/high/medium).',
    '16. CRUCES OBLIGATORIOS a evaluar:',
    '  - Medicacion actual vs motivo de consulta (efectos adversos, iatrogenia, abuso)',
    '  - Adherencia terapeutica vs enfermedad de base vs motivo de consulta',
    '  - Antecedentes familiares vs factores de riesgo del paciente (carga hereditaria)',
    '  - Habitos vs motivo de consulta y vs enfermedades de base',
    '  - Revision por sistemas vs motivo de consulta (sintomas acompanantes no reportados espontaneamente)',
    '  - Si un cruce aplica y los datos son suficientes, referenciar criterios semiologicos cuando sea pertinente (ej: "uso de analgesicos >=10 dias/mes durante >=3 meses cumple el patron temporal descrito en la literatura para cefalea por uso excesivo de medicacion"). NO diagnosticar — solo describir el patron.',
    '',
    'SAFETY FLAGS EXHAUSTIVOS:',
    '17. safetyFlags debe incluir TODA condicion que requiera atencion inmediata del medico, incluyendo:',
    '  - Alergias severas (anafilaxia)',
    '  - Adherencia irregular a medicacion critica (antihipertensivos, anticoagulantes, insulina)',
    '  - Uso frecuente de AINEs (riesgo gastrointestinal, renal, cardiovascular)',
    '  - Red flags positivos del screening',
    '  - Interacciones medicamentosas potenciales evidentes de los datos',
    '  - Cada flag debe ser autocontenido: incluir el dato, la fuente y por que es relevante.',
    '',
    'PREGUNTAS DIFERENCIADAS:',
    '18. nextQuestions = preguntas para el PACIENTE. Deben ser dirigidas, especificas, orientadas a cerrar huecos semiologicos concretos. Nunca genericas.',
    '19. clinicianQuestions = preguntas para el MEDICO DE PLANTA durante el pase de guardia. Son preguntas de razonamiento clinico que demuestran que ya cruzaste la informacion. Deben ser accionables y secuenciales (primero lo basico, despues lo complejo). No sugerir estudios — preguntar al staff si esta de acuerdo con la linea de razonamiento.',
    '',
    'COBERTURA ARGENTE:',
    '20. La salida debe cubrir, con honestidad, estas secciones: datos personales, motivo de consulta, enfermedad actual, antecedentes personales, antecedentes familiares e interrogatorio por sistemas.',
    '21. Si una seccion no esta suficientemente sustentada, declarala en argenteCoverage.weakOrMissing.',
    '',
    'IDIOMA OBLIGATORIO:',
    '22. TODOS los campos de texto de la respuesta deben estar en ESPAÑOL. Esto incluye clinicalNarrative, associatedSymptoms, aggravatingFactors, relievingFactors, treatmentsTried, missingData, observation en crossReferences, clinicianQuestions, question y rationale en nextQuestions, message en qualityAlerts, safetyFlags, y cualquier otro campo de texto libre. Los unicos valores que pueden estar en ingles son los enum cerrados del schema (ej: "critical", "high", "headache").',
    '',
    '23. Responde exclusivamente en JSON valido y estricto, segun el schema adjunto.',
  ].join(' ')
}

export function getAnamnesisExtractionResponseSchema(): Record<string, unknown> {
  const nullableEnum = (values: readonly string[]): Record<string, unknown> => ({
    type: ['string', 'null'],
    enum: [...values, null],
  })

  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      normalizedOpenFields: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ageMonths: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 1200,
          },
          occupationCategory: nullableEnum([
            'student',
            'administrative',
            'manual_labor',
            'healthcare',
            'education',
            'technology',
            'commerce_service',
            'unemployed',
            'retired',
            'homemaker',
            'other',
          ]),
          occupationYears: {
            type: ['integer', 'null'],
            minimum: 0,
            maximum: 50,
          },
          chiefComplaintCode: nullableEnum([
            'headache',
            'chest_pain',
            'cervical_pressure',
            'dyspnea',
            'cough',
            'abdominal_pain',
            'digestive_symptoms',
            'genitourinary_symptoms',
            'palpitations',
            'fatigue',
            'fever',
            'dizziness',
            'back_pain',
            'neuro',
            'mood_disorder',
            'other',
          ]),
          medicationFamilies: {
            type: 'array',
            maxItems: 3,
            items: {
              type: 'string',
              enum: [
                'analgesic_antipyretic',
                'nsaid',
                'ppi',
                'antibiotic_beta_lactam',
                'antibiotic_other',
                'antihypertensive_ace',
                'antihypertensive_arb',
                'beta_blocker',
                'diuretic',
                'antidiabetic_oral',
                'insulin',
                'bronchodilator',
                'corticosteroid',
                'antihistamine',
                'anxiolytic',
                'antidepressant',
                'anticonvulsant',
                'hormonal_contraceptive',
                'thyroid_hormone',
                'other',
              ],
            },
          },
          allergyGroups: {
            type: 'array',
            maxItems: 2,
            items: {
              type: 'string',
              enum: [
                'beta_lactam',
                'nsaid',
                'contrast_media',
                'food_seafood',
                'food_nuts',
                'food_dairy',
                'latex',
                'pollen',
                'dust_mites',
                'insect_sting',
                'other',
              ],
            },
          },
          fatherDeathCause: nullableEnum([
            'alive',
            'myocardial_infarction',
            'stroke',
            'cancer',
            'respiratory_failure',
            'infection',
            'accident_trauma',
            'suicide',
            'unknown',
            'other',
          ]),
          motherDeathCause: nullableEnum([
            'alive',
            'myocardial_infarction',
            'stroke',
            'cancer',
            'respiratory_failure',
            'infection',
            'accident_trauma',
            'suicide',
            'unknown',
            'other',
          ]),
          chestPainPhenotype: nullableEnum([
            'oppressive',
            'stabbing',
            'burning',
            'pleuritic',
            'tearing',
            'tightness',
            'nonspecific',
          ]),
          coughPhenotype: nullableEnum([
            'dry',
            'productive_clear',
            'productive_purulent',
            'bloody',
            'nocturnal',
            'paroxysmal',
            'nonspecific',
          ]),
          redFlagCodes: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'string',
              enum: [
                'neurologic_deficit',
                'syncope',
                'chest_pain_exertional',
                'dyspnea_at_rest',
                'hemoptysis',
                'gastrointestinal_bleeding',
                'weight_loss',
                'persistent_vomiting',
                'hematuria',
                'severe_progressive_pain',
                'fever_persistent',
                'other',
              ],
            },
          },
          vitals: {
            type: ['object', 'null'],
            additionalProperties: false,
            properties: {
              bloodPressure: { type: ['string', 'null'], description: 'Formato: 120/80' },
              heartRate: { type: ['integer', 'null'], description: 'bpm' },
              weightKg: { type: ['number', 'null'], description: 'kg' },
              heightCm: { type: ['integer', 'null'], description: 'cm' },
              temperature: { type: ['number', 'null'], description: 'Celsius' },
            }
          },
        },
        required: [
          'ageMonths',
          'occupationCategory',
          'occupationYears',
          'chiefComplaintCode',
          'medicationFamilies',
          'allergyGroups',
          'fatherDeathCause',
          'motherDeathCause',
          'chestPainPhenotype',
          'coughPhenotype',
          'redFlagCodes',
        ],
      },
      chiefComplaint: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rawText: { type: ['string', 'null'] },
          normalizedMedicalText: { type: ['string', 'null'] },
          sourceSections: { type: 'array', items: { type: 'string' } },
          contextualMismatch: { type: 'boolean' },
        },
        required: ['rawText', 'normalizedMedicalText', 'sourceSections', 'contextualMismatch'],
      },
      presentIllness: {
        type: 'object',
        additionalProperties: false,
        properties: {
          chronology: { type: ['string', 'null'] },
          severity: { type: ['string', 'null'] },
          clinicalNarrative: { type: 'string' },
          associatedSymptoms: { type: 'array', items: { type: 'string' } },
          aggravatingFactors: { type: 'array', items: { type: 'string' } },
          relievingFactors: { type: 'array', items: { type: 'string' } },
          treatmentsTried: { type: 'array', items: { type: 'string' } },
          missingData: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'chronology',
          'severity',
          'clinicalNarrative',
          'associatedSymptoms',
          'aggravatingFactors',
          'relievingFactors',
          'treatmentsTried',
          'missingData',
        ],
      },
      personalHistory: {
        type: 'object',
        additionalProperties: false,
        properties: {
          physiological: { type: 'array', items: { type: 'string' } },
          pathological: { type: 'array', items: { type: 'string' } },
          lifestyleAndContext: { type: 'array', items: { type: 'string' } },
        },
        required: ['physiological', 'pathological', 'lifestyleAndContext'],
      },
      familyHistory: { type: 'array', items: { type: 'string' } },
      reviewOfSystems: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cardiovascular: { type: 'array', items: { type: 'string' } },
          respiratory: { type: 'array', items: { type: 'string' } },
          digestive: { type: 'array', items: { type: 'string' } },
          genitourinary: { type: 'array', items: { type: 'string' } },
        },
        required: ['cardiovascular', 'respiratory', 'digestive', 'genitourinary'],
      },
      qualityAlerts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
            },
            code: { type: 'string' },
            message: { type: 'string' },
            sourceSections: { type: 'array', items: { type: 'string' } },
          },
          required: ['severity', 'code', 'message', 'sourceSections'],
        },
      },
      argenteCoverage: {
        type: 'object',
        additionalProperties: false,
        properties: {
          adequatelyCovered: { type: 'array', items: { type: 'string' } },
          weakOrMissing: { type: 'array', items: { type: 'string' } },
        },
        required: ['adequatelyCovered', 'weakOrMissing'],
      },
      dataIntegrity: {
        type: 'object',
        additionalProperties: false,
        properties: {
          contradictions: { type: 'array', items: { type: 'string' } },
          possibleMiscalicks: { type: 'array', items: { type: 'string' } },
          duplicatedNarratives: { type: 'array', items: { type: 'string' } },
          missingCriticalData: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'contradictions',
          'possibleMiscalicks',
          'duplicatedNarratives',
          'missingCriticalData',
        ],
      },
      clinicalCrossReferences: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceSections: { type: 'array', items: { type: 'string' } },
            observation: { type: 'string' },
            relevance: {
              type: 'string',
              enum: ['critical', 'high', 'medium'],
            },
          },
          required: ['sourceSections', 'observation', 'relevance'],
        },
      },
      clinicianQuestions: { type: 'array', items: { type: 'string' } },
      nextQuestions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium'],
            },
            targetSection: {
              type: 'string',
              enum: [
                'motivo_consulta',
                'enfermedad_actual',
                'antecedentes_personales',
                'antecedentes_familiares',
                'revision_sistemas',
                'integridad',
              ],
            },
            questionType: {
              type: 'string',
              enum: ['open', 'closed', 'clarification'],
            },
            question: { type: 'string' },
            rationale: { type: 'string' },
          },
          required: ['priority', 'targetSection', 'questionType', 'question', 'rationale'],
        },
      },
      safetyFlags: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'normalizedOpenFields',
      'chiefComplaint',
      'presentIllness',
      'personalHistory',
      'familyHistory',
      'reviewOfSystems',
      'qualityAlerts',
      'argenteCoverage',
      'dataIntegrity',
      'clinicalCrossReferences',
      'clinicianQuestions',
      'nextQuestions',
      'safetyFlags',
    ],
  }
}

export function buildAnamnesisExtractionRequest(input: {
  patientId: string
  patientLabel: string
  anamnesisStatus: string
  privacyAccepted: boolean
  sections: AnamnesisSectionRecord[]
  clarificationTurns?: AnamnesisClarificationTurn[]
  modifiedSections?: string[]
  previousExtraction?: Record<string, unknown>
  historicalContext?: AnamnesisExtractionRequest['historicalContext']
}): AnamnesisExtractionRequest {
  const bodySelections = extractBodySelectionsFromSections(input.sections)
  const isRevisit = input.modifiedSections && input.modifiedSections.length > 0

  const guardrails = [
    'No emitir diagnosticos ni diferenciales.',
    'No indicar tratamiento ni conducta terapeutica.',
    'Consolidar texto libre disperso en una sola queja cardinal si corresponde.',
    'Marcar datos incongruentes o aislados como alertas a confirmar.',
    'Mantener separados hechos, inferencias y datos faltantes.',
    'Usar bodySelections como evidencia anatomica estructurada cuando exista.',
  ]

  if (input.previousExtraction) {
    guardrails.push(
      'CHECKPOINT FINAL CON EXTRACCION PARCIAL PREVIA: Se adjunta el resultado de la extraccion parcial (checkpoint 6) como previousExtraction.',
      'Usa esta extraccion previa como base. Refina, corrige y completa — no empieces de cero.',
      'Si la extraccion parcial ya identifico crossReferences, safetyFlags o qualityAlerts validos, mantenelos y complementalos con los datos nuevos.',
      'Si datos nuevos contradicen la extraccion parcial, prioriza los datos nuevos y marca la discrepancia en dataIntegrity.contradictions.',
      'Las secciones que no cambiaron desde el parcial deben mantener el mismo analisis salvo que nuevos datos obliguen a reconsiderar.',
    )
  }

  if (input.historicalContext) {
    guardrails.push(
      'CONTEXTO LONGITUDINAL FILTRADO: historicalContext.globalContext representa antecedentes longitudinales estables del paciente (cronicos, medicacion, alergias). Consideralo siempre como contexto basal si aporta al analisis actual.',
      'CONTEXTO LONGITUDINAL FILTRADO: historicalContext.relatedEpisodes incluye SOLO episodios previos que ya fueron filtrados como clinicamente relacionados con la consulta actual. Usalos como continuidad del problema actual, no como evidencia nueva independiente.',
      'No arrastres episodios previos no listados en historicalContext.relatedEpisodes.',
      'Si un episodio previo relacionado contradice la evidencia actual, prioriza la evidencia actual y marca la discrepancia en dataIntegrity.contradictions.',
    )
  }

  if (isRevisit) {
    guardrails.push(
      `REVISITA: El paciente actualizo las secciones [${(input.modifiedSections ?? []).join(', ')}]. Las demas secciones no cambiaron desde la ultima visita.`,
      'Focalizar nextQuestions en las secciones modificadas. No generar preguntas sobre secciones que no cambiaron salvo que detectes una incongruencia critica con los datos nuevos.',
      'En coverage, marcar las secciones no modificadas como adequate (son datos previos validados).',
    )
  }

  return {
    version: 'anamnesis_extraction_v2',
    purpose: 'extract_structured_anamnesis_without_diagnosis',
    patient: {
      patientId: input.patientId,
      patientLabel: input.patientLabel,
      anamnesisStatus: input.anamnesisStatus,
      privacyAccepted: input.privacyAccepted,
    },
    guardrails,
    deterministicSummary: buildAnamnesisSummary(input.sections),
    sourceSections: input.sections,
    bodySelections,
    clarificationTurns: input.clarificationTurns ?? [],
    ...(input.previousExtraction ? { previousExtraction: input.previousExtraction } : {}),
    ...(input.historicalContext ? { historicalContext: input.historicalContext } : {}),
  }
}

async function executeGeminiExtraction(
  target: ExtractionTarget,
  request: AnamnesisExtractionRequest,
): Promise<{
  providerName: ExtractionProvider
  modelName: string
  result: AnamnesisExtractionResult
  rawResponse: Json
}> {
  const apiKey = resolveServerEnv('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')
  const response = await fetch(
    `${GEMINI_GENERATE_CONTENT_URL}/${encodeURIComponent(target.modelName)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildAnamnesisExtractionSystemPrompt() }],
        },
        contents: [
          {
            role: 'user',
            parts: [{
              text: [
                'DATOS DEL PACIENTE (JSON):',
                JSON.stringify(request),
                '',
                'SCHEMA DE RESPUESTA OBLIGATORIO (JSON Schema):',
                JSON.stringify(getAnamnesisExtractionResponseSchema()),
                '',
                'Responde UNICAMENTE con un JSON que cumpla este schema. Sin texto adicional.',
              ].join('\n'),
            }],
          },
        ],
        generationConfig: {
          temperature: 0,
          seed: 1,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
          // Limit internal "thinking" tokens so output budget is reserved
          // for the actual JSON response, not consumed by reasoning.
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    },
  )

  let payload: Record<string, unknown>
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    logger.error('[executeGeminiExtraction] Gemini response not JSON', { status: response.status })
    throw new Error(`Gemini response not JSON (HTTP ${response.status})`)
  }
  if (!response.ok) {
    logger.error('[executeGeminiExtraction] Gemini request failed', payload)
    throw new Error(
      typeof payload.error === 'object' && payload.error && 'message' in payload.error
        ? String((payload.error as { message?: string }).message)
        : 'No fue posible obtener la extraccion de anamnesis',
    )
  }

  return {
    providerName: target.providerName,
    modelName: target.modelName,
    result: extractGeminiStructuredOutput(payload),
    rawResponse: payload as Json,
  }
}

/** Gemini fallback model when primary is overloaded (429/503) */
const GEMINI_FALLBACK_MODEL = 'gemini-3-flash-preview'

/** Retry with exponential backoff + model fallback */
async function executeGeminiWithRetry(
  target: ExtractionTarget,
  request: AnamnesisExtractionRequest,
  maxRetries = 2,
): ReturnType<typeof executeGeminiExtraction> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const currentTarget = attempt <= 1
      ? target
      : { ...target, modelName: GEMINI_FALLBACK_MODEL } // last attempt: fallback model

    try {
      return await executeGeminiExtraction(currentTarget, request)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const msg = lastError.message.toLowerCase()
      const isRetryable = msg.includes('high demand') || msg.includes('overloaded')
        || msg.includes('429') || msg.includes('503') || msg.includes('resource exhausted')

      if (!isRetryable || attempt === maxRetries) {
        throw lastError
      }

      const delayMs = 2000 * (attempt + 1) // 2s, 4s
      logger.warn(`[executeGeminiWithRetry] Attempt ${attempt + 1} failed (${lastError.message}), retrying in ${delayMs}ms`, {
        attempt,
        model: currentTarget.modelName,
        nextModel: attempt + 1 <= 1 ? target.modelName : GEMINI_FALLBACK_MODEL,
      })
      await new Promise(r => setTimeout(r, delayMs))
    }
  }

  throw lastError ?? new Error('Extraction failed after retries')
}

export async function executeAnamnesisExtraction(
  request: AnamnesisExtractionRequest,
): Promise<{
  providerName: ExtractionProvider
  modelName: string
  result: AnamnesisExtractionResult
  rawResponse: Json
}> {
  const target = resolveExtractionTarget()
  if (!target) {
    throw new Error('No hay un proveedor IA configurado para la extraccion de anamnesis')
  }

  return executeGeminiWithRetry(target, request)
}
