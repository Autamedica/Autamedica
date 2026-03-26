import {
  AnamnesisExtractionResultSchema,
  BodyMapSelectionsSchema,
} from '@/lib/patients/lib/zod/anamnesis-extraction'
import type { BodyMapSelection } from '@/lib/patients/types/anamnesis'
import type {
  AnamnesisClarificationTurn,
  AnamnesisSectionRecord,
  AnamnesisExtractionRequest,
  AnamnesisExtractionResult,
} from '@/lib/patients/types/anamnesis-extraction'
import {
  buildAnamnesisSummary,
  getServerEnvOrDefault,
  logger,
} from '@autamedica/shared'
import type { Json } from '@autamedica/types'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-2026-03-05'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'
export const ANAMNESIS_EXTRACTION_PROMPT_VERSION = 'argente_interrogator_v3'

type ExtractionProvider = 'openai' | 'gemini'
type ExtractionProviderPreference = ExtractionProvider | 'auto'

interface ExtractionTarget {
  providerName: ExtractionProvider
  modelName: string
}

function normalizeProviderPreference(value: string | null | undefined): ExtractionProviderPreference {
  if (value === 'openai' || value === 'gemini') {
    return value
  }

  return 'auto'
}

/**
 * Resolve server env var — works in both Node (process.env) and Cloudflare Workers (import.meta.env).
 * Cloudflare Pages secrets are exposed via import.meta.env at runtime in Astro SSR.
 */
function resolveServerEnv(name: string): string | undefined {
  // 1. Astro / Vite — import.meta.env (works in Cloudflare Pages)
  try {
    const metaVal = (import.meta as unknown as { env: Record<string, string> }).env?.[name]
    if (metaVal) return metaVal
  } catch { /* not available */ }

  // 2. Node / fallback — process.env
  try {
    return getServerEnvOrDefault(name)
  } catch { /* not available */ }

  return undefined
}

function hasOpenAiKey(): boolean {
  return Boolean(resolveServerEnv('OPENAI_API_KEY'))
}

function hasGeminiKey(): boolean {
  return Boolean(resolveServerEnv('GEMINI_API_KEY'))
}

function resolveExtractionTarget(): ExtractionTarget | null {
  const preferredProvider = normalizeProviderPreference(
    resolveServerEnv('ANAMNESIS_AI_PROVIDER') ?? resolveServerEnv('PATIENT_AI_PROVIDER'),
  )

  if (preferredProvider === 'openai') {
    return hasOpenAiKey()
      ? {
          providerName: 'openai',
          modelName:
            resolveServerEnv('ANAMNESIS_AI_OPENAI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
            DEFAULT_OPENAI_MODEL,
        }
      : null
  }

  if (preferredProvider === 'gemini') {
    return hasGeminiKey()
      ? {
          providerName: 'gemini',
          modelName:
            resolveServerEnv('ANAMNESIS_AI_GEMINI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
            DEFAULT_GEMINI_MODEL,
        }
      : null
  }

  if (hasOpenAiKey()) {
    return {
      providerName: 'openai',
      modelName:
        resolveServerEnv('ANAMNESIS_AI_OPENAI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
        DEFAULT_OPENAI_MODEL,
    }
  }

  if (hasGeminiKey()) {
    return {
      providerName: 'gemini',
      modelName:
        resolveServerEnv('ANAMNESIS_AI_GEMINI_MODEL') ?? resolveServerEnv('ANAMNESIS_AI_MODEL') ??
        DEFAULT_GEMINI_MODEL,
    }
  }

  return null
}

export function buildAnamnesisExtractionSystemPrompt(): string {
  return [
    `Version del prompt: ${ANAMNESIS_EXTRACTION_PROMPT_VERSION}.`,
    'Rol: extractor clinico de anamnesis para soporte interno medico.',
    'Mision: convertir datos crudos del formulario y texto libre del paciente en una estructura semiologica auditable, siguiendo la logica de Argente-Alvarez.',
    'Prohibiciones absolutas:',
    '- No emitir diagnosticos, diferenciales, probabilidades diagnosticas ni tratamientos.',
    '- No agregar sintomas, antecedentes, cronologias ni banderas rojas que no esten en la evidencia provista.',
    '- No completar huecos con sentido comun medico.',
    'Reglas de trabajo:',
    '1. Usa solo el JSON provisto.',
    '2. Distingue siempre hechos, inferencias operativas y datos faltantes.',
    '3. Si el campo inicial de motivo de consulta describe contexto o desencadenante y la queja cardinal aparece despues, rescata la queja cardinal y marca contextualMismatch=true.',
    '4. Si el mismo relato libre aparece repetido en multiples aparatos o sistemas, consolidalo una sola vez y marca duplicacion en dataIntegrity.duplicatedNarratives.',
    '5. Si aparece un hallazgo aislado sin corroboracion o con alta probabilidad de misclick, no lo trates como hecho firme: pasalo a qualityAlerts y dataIntegrity.possibleMiscalicks.',
    '6. La enfermedad actual debe quedar redactada como narrativa clinica neutra, cronologica y verificable, sin diagnostico.',
    '7. La salida debe cubrir, con honestidad, estas secciones Argente: datos personales, motivo de consulta, enfermedad actual, antecedentes personales, antecedentes familiares e interrogatorio por sistemas.',
    '8. Si una seccion no esta suficientemente sustentada por los datos, declarala en argenteCoverage.weakOrMissing y explicita sus faltantes.',
    '9. clinicianQuestions y nextQuestions deben servir para que un medico o un flujo conversacional repregunte lo estrictamente necesario para cerrar huecos semiologicos.',
    '10. Debes completar normalizedOpenFields usando exclusivamente las categorias cerradas del schema. Si no hay evidencia suficiente para codificar un campo, usa null o [] segun corresponda.',
    '11. chiefComplaintCode debe reflejar la queja cardinal clinica dominante y no el desencadenante contextual.',
    '12. redFlagCodes solo puede incluir banderas rojas explicitamente sustentadas por la evidencia del caso.',
    '13. Si clarificationTurns esta presente, debes tratar sus respuestas como evidencia complementaria y prioritaria para cerrar huecos semiologicos, sin inventar nada fuera de lo respondido.',
    '14. Si una aclaracion resuelve una seccion debil, debes reducir weakOrMissing y actualizar nextQuestions en consecuencia.',
    '15. bodySelections es evidencia anatomica estructurada y deterministica. Usala como fuente prioritaria para localizacion, lateralidad, intensidad y tipo de sintoma cuando exista.',
    '16. Si el relato libre y bodySelections no coinciden, no fuerces una sintesis falsa: marca la discrepancia en qualityAlerts o dataIntegrity.',
    '17. Responde exclusivamente en JSON valido y estricto, segun el schema adjunto.',
  ].join(' ')
}

function isJsonObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deduplicateBodySelections(
  selections: BodyMapSelection[],
): BodyMapSelection[] {
  const deduplicated = new Map<string, BodyMapSelection>()

  for (const selection of selections) {
    deduplicated.set(selection.partId, selection)
  }

  return Array.from(deduplicated.values())
}

function extractBodySelectionsFromSections(
  sections: AnamnesisSectionRecord[],
): BodyMapSelection[] {
  const collected: BodyMapSelection[] = []

  for (const section of sections) {
    if (!isJsonObject(section.data)) {
      continue
    }

    for (const key of ['body_selections', 'bodySelections']) {
      const candidate = section.data[key]
      const parsed = BodyMapSelectionsSchema.safeParse(candidate)
      if (parsed.success) {
        collected.push(...(parsed.data as BodyMapSelection[]))
      }
    }
  }

  return deduplicateBodySelections(collected)
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
      'clinicianQuestions',
      'nextQuestions',
      'safetyFlags',
    ],
  }
}

function parseStructuredExtractionPayload(
  rawPayload: string,
  providerName: ExtractionProvider,
): AnamnesisExtractionResult {
  let parsedPayload: unknown

  try {
    parsedPayload = JSON.parse(rawPayload)
  } catch (error) {
    logger.error(`[extract ${providerName}] Invalid JSON payload`, {
      error,
      rawPayload,
    })
    throw new Error('La salida del modelo no fue JSON valido')
  }

  const validation = AnamnesisExtractionResultSchema.safeParse(parsedPayload)
  if (!validation.success) {
    logger.warn(`[extract ${providerName}] Structured output validation issues (using raw)`, {
      issues: validation.error.issues.slice(0, 5).map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    })
    // Use the raw parsed payload — the model may have returned a close-enough structure.
    // Missing fields will be undefined, which downstream code handles gracefully.
    return parsedPayload as AnamnesisExtractionResult
  }

  return validation.data as AnamnesisExtractionResult
}

function extractOpenAiStructuredOutput(payload: Record<string, unknown>): AnamnesisExtractionResult {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return parseStructuredExtractionPayload(payload.output_text, 'openai')
  }

  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const message = item as Record<string, unknown>
    const content = Array.isArray(message.content) ? message.content : []
    for (const entry of content) {
      if (!entry || typeof entry !== 'object') {
        continue
      }

      const record = entry as Record<string, unknown>
      if (
        (record.type === 'output_text' || record.type === 'text') &&
        typeof record.text === 'string' &&
        record.text.trim()
      ) {
        return parseStructuredExtractionPayload(record.text, 'openai')
      }
    }
  }

  throw new Error('La respuesta del modelo no incluyo contenido estructurado')
}

function extractGeminiStructuredOutput(payload: Record<string, unknown>): AnamnesisExtractionResult {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }

    const candidateRecord = candidate as Record<string, unknown>
    const content =
      candidateRecord.content && typeof candidateRecord.content === 'object'
        ? (candidateRecord.content as Record<string, unknown>)
        : null
    const parts = content && Array.isArray(content.parts) ? content.parts : []

    for (const part of parts) {
      if (!part || typeof part !== 'object') {
        continue
      }

      const text = (part as Record<string, unknown>).text
      if (typeof text === 'string' && text.trim()) {
        return parseStructuredExtractionPayload(text, 'gemini')
      }
    }
  }

  throw new Error('La respuesta de Gemini no incluyo contenido estructurado')
}

export function isAnamnesisExtractionConfigured(): boolean {
  return resolveExtractionTarget() !== null
}

export function getAnamnesisExtractionProviderName(): ExtractionProvider | null {
  return resolveExtractionTarget()?.providerName ?? null
}

export function getAnamnesisExtractionModelName(): string {
  return resolveExtractionTarget()?.modelName ?? DEFAULT_OPENAI_MODEL
}

export function buildAnamnesisExtractionRequest(input: {
  patientId: string
  patientLabel: string
  anamnesisStatus: string
  privacyAccepted: boolean
  sections: AnamnesisSectionRecord[]
  clarificationTurns?: AnamnesisClarificationTurn[]
}): AnamnesisExtractionRequest {
  const bodySelections = extractBodySelectionsFromSections(input.sections)

  return {
    version: 'anamnesis_extraction_v2',
    purpose: 'extract_structured_anamnesis_without_diagnosis',
    patient: {
      patientId: input.patientId,
      patientLabel: input.patientLabel,
      anamnesisStatus: input.anamnesisStatus,
      privacyAccepted: input.privacyAccepted,
    },
    guardrails: [
      'No emitir diagnosticos ni diferenciales.',
      'No indicar tratamiento ni conducta terapeutica.',
      'Consolidar texto libre disperso en una sola queja cardinal si corresponde.',
      'Marcar datos incongruentes o aislados como alertas a confirmar.',
      'Mantener separados hechos, inferencias y datos faltantes.',
      'Usar bodySelections como evidencia anatomica estructurada cuando exista.',
    ],
    deterministicSummary: buildAnamnesisSummary(input.sections),
    sourceSections: input.sections,
    bodySelections,
    clarificationTurns: input.clarificationTurns ?? [],
  }
}

async function executeOpenAiExtraction(
  target: ExtractionTarget,
  request: AnamnesisExtractionRequest,
): Promise<{
  providerName: ExtractionProvider
  modelName: string
  result: AnamnesisExtractionResult
  rawResponse: Json
}> {
  const apiKey = resolveServerEnv('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: target.modelName,
      temperature: 0,
      store: false,
      input: [
        {
          role: 'system',
          content: buildAnamnesisExtractionSystemPrompt(),
        },
        {
          role: 'user',
          content: JSON.stringify(request),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'anamnesis_extraction',
          strict: true,
          schema: getAnamnesisExtractionResponseSchema(),
        },
      },
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    logger.error('[executeOpenAiExtraction] OpenAI request failed', payload)
    throw new Error(
      typeof payload.error === 'object' && payload.error && 'message' in payload.error
        ? String((payload.error as { message?: string }).message)
        : 'No fue posible obtener la extraccion de anamnesis',
    )
  }

  return {
    providerName: target.providerName,
    modelName: target.modelName,
    result: extractOpenAiStructuredOutput(payload),
    rawResponse: payload as Json,
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
          responseMimeType: 'application/json',
        },
      }),
    },
  )

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
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

  if (target.providerName === 'gemini') {
    return executeGeminiExtraction(target, request)
  }

  return executeOpenAiExtraction(target, request)
}
