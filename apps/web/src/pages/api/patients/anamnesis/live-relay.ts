/**
 * API: Stateless Gemini conversation relay for voice anamnesis.
 * Deterministic 8-block medical interview protocol.
 * Each request includes full conversation history — no server-side state.
 *
 * POST /api/patients/anamnesis/live-relay
 * Body: {
 *   text: string,
 *   history?: Turn[],
 *   patientContext?: boolean,
 *   checkpoint?: 'partial' | 'final',
 *   openingPromptSent?: boolean,
 *   guidanceQuestions?: string[],
 *   coverageGaps?: string[],
 *   coverageSummary?: string
 * }
 * Returns: { text: string, history: Turn[], isComplete: boolean, extractedFields?: Record }
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { resolveServerEnv, getQuestionsModelName } from '@/lib/patients/server/ai-provider'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Build system instruction with optional patient context */
interface GuidanceContext {
  checkpoint?: 'partial' | 'final'
  questions: string[]
  gaps: string[]
  coverageSummary?: string
}

function shortenQuestionForVoice(question: string, maxLength = 160): string {
  const cleaned = question
    .replace(/^hola[^.?!]*[.?!]\s*/i, '')
    .replace(/^quiero hacerte una pregunta breve para completar la información\.?\s*/i, '')
    .replace(/^necesito una aclaración breve\.?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  const sentences = cleaned.split(/(?<=[?!.])\s+/).filter(Boolean)
  const firstSentence = sentences[0] ?? cleaned
  if (firstSentence.length <= maxLength) return firstSentence

  const candidates = [
    firstSentence.lastIndexOf('?'),
    firstSentence.lastIndexOf(','),
    firstSentence.lastIndexOf(' ', maxLength),
  ].filter((value) => value >= Math.floor(maxLength * 0.55))

  const cutIndex = candidates.length > 0 ? Math.max(...candidates) : maxLength
  const shortened = firstSentence.slice(0, cutIndex + 1).trim()
  return shortened.endsWith('?') || !firstSentence.includes('?')
    ? shortened
    : `${shortened}?`
}

function summarizeSectionData(sectionData?: Record<string, Record<string, unknown>>): string {
  if (!sectionData || Object.keys(sectionData).length === 0) return ''
  const lines: string[] = []
  for (const [section, data] of Object.entries(sectionData)) {
    const entries = Object.entries(data)
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    if (entries.length > 0) lines.push(`[${section}] ${entries.join('; ')}`)
  }
  return lines.join('\n')
}

function buildSystemInstruction(
  patientInfo?: { name: string; age: number; completedSections: string[]; sectionData?: Record<string, Record<string, unknown>> },
  guidance?: GuidanceContext,
): string {
  const existingData = summarizeSectionData(patientInfo?.sectionData)
  const context = patientInfo
    ? `\nCONTEXTO DEL PACIENTE:\n- Nombre: ${patientInfo.name}\n- Edad: ${patientInfo.age} años\n- Secciones ya completadas: ${patientInfo.completedSections.length > 0 ? patientInfo.completedSections.join(', ') : 'ninguna'}${existingData ? `\n\nDATOS YA REGISTRADOS EN EL FORMULARIO:\n${existingData}\n\nIMPORTANTE: NO repitas preguntas sobre datos que ya están registrados arriba. Tu rol es REFINAR semiológicamente: profundizar en síntomas reportados, explorar características (localización, irradiación, intensidad, duración, factores agravantes/atenuantes).` : '\nSi ya tiene secciones completadas, enfocate en lo que falta o pudo haber cambiado.'}\n`
    : ''

  if (guidance && (guidance.questions.length > 0 || guidance.gaps.length > 0)) {
    return `Sos un médico residente de AutaMedica realizando una REFINACIÓN SEMIOLÓGICA por voz de una anamnesis ya iniciada.
${context}
CHECKPOINT ACTUAL: ${guidance.checkpoint ?? 'partial'}
RESUMEN DE COBERTURA: ${guidance.coverageSummary ?? 'Sin resumen'}
AREAS CON DATOS FALTANTES: ${guidance.gaps.length > 0 ? guidance.gaps.join(', ') : 'sin especificar'}
PREGUNTAS PRIORITARIAS A RESOLVER:
${guidance.questions.length > 0 ? guidance.questions.map((question, index) => `${index + 1}. ${question}`).join('\n') : '- Pedí una aclaración clínica relevante.'}

OBJETIVO:
- REFINÁ semiológicamente los síntomas ya reportados: preguntá detalles clínicos (¿desde cuándo? ¿cómo es? ¿qué lo mejora o empeora? ¿se asocia con algo?).
- Preguntá UNA sola cosa por turno.
- Si el paciente ya respondió una de las preguntas prioritarias, pasá a la siguiente sin repetir.
- No abras bloques nuevos ni hagas una anamnesis completa desde cero.
- Máximo 3 preguntas del modelo antes del cierre.

REGLAS:
- Español argentino informal (voseo), tono cálido y profesional.
- Hablá SIEMPRE en segunda persona.
- Cada pregunta debe sonar natural al leerla en voz alta.
- Máximo 18 palabras o 160 caracteres por turno.
- Evitá preguntas largas con dos ideas encadenadas en la misma frase.
- No diagnostiques ni sugieras tratamientos.
- No uses abreviaturas médicas.
- No uses comillas ni apóstrofes.

FINALIZACIÓN OBLIGATORIA:
Cuando ya tengas suficiente información o hayas agotado las preguntas prioritarias:
1. Empezá con el tag [ANAMNESIS_COMPLETA]
2. Hacé un resumen corto de lo que acabás de aclarar
3. Cerrá con una frase breve indicando que la información quedó registrada.`
  }

  return `Sos un médico residente de AutaMedica realizando una anamnesis estructurada por voz.
${context}
PROTOCOLO — Seguí este orden EXACTO, un bloque por mensaje:

BLOQUE 1 — Motivo de consulta: preguntá qué le pasa y desde cuándo.
BLOQUE 2 — Enfermedad actual: profundizá con temporalidad, intensidad (1-10), qué lo empeora y qué lo alivia.
BLOQUE 3 — Antecedentes personales: enfermedades previas, cirugías, internaciones.
BLOQUE 4 — Medicación actual: qué toma, dosis si la sabe.
BLOQUE 5 — Alergias: medicamentos, alimentos, otros.
BLOQUE 6 — Hábitos: tabaco, alcohol, ejercicio, sueño (todo en una pregunta).
BLOQUE 7 — Revisión por sistemas: según el motivo de consulta, preguntá 1-2 síntomas asociados relevantes.
BLOQUE 8 — Cierre: hacé un resumen de 3-4 líneas confirmando lo que registraste.

REGLAS:
- UNA pregunta por mensaje, corta y directa
- Español argentino informal (voseo), tono cálido
- Hablá SIEMPRE en segunda persona dirigiéndote al paciente (decí vos tenés, no el paciente tiene)
- NUNCA hables del paciente en tercera persona (NUNCA digas Eduardo tiene o el paciente refiere)
- Máximo 18 palabras o 160 caracteres por turno
- Si el paciente ya respondió algo de un bloque en mensajes anteriores, saltá ese bloque
- Si detectás bandera roja (dolor de pecho, dificultad respiratoria, pérdida de consciencia, sangrado activo), mencionalo con calma y priorizalo
- NO diagnostiques ni sugieras tratamientos
- NO uses abreviaturas médicas (decí tensión arterial, no TA)
- NO uses comillas ni apóstrofes en tus respuestas

FINALIZACIÓN OBLIGATORIA:
Cuando completes BLOQUE 8, tu mensaje DEBE:
1. Empezar con el tag [ANAMNESIS_COMPLETA]
2. Incluir el resumen hablado para el paciente
3. Al final, incluir un bloque JSON con los datos extraídos:
\`\`\`json
{"extractedFields":{"motivo_principal":"...","cuando_empezo":"...","intensidad":"...","enfermedades_previas":"...","medicamentos":"...","alergias":"...","habitos":"...","sintomas_relevantes":"..."}}
\`\`\``
}

/** Max model turns before forced completion */
const MAX_MODEL_TURNS = 12

const COMPLETION_TAG = '[ANAMNESIS_COMPLETA]'

interface Turn {
  role: 'user' | 'model'
  text: string
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return json({ success: false, error: 'unauthorized' }, 401)

  const raw = await request.json().catch(() => ({})) as Record<string, unknown>
  const userText = typeof raw.text === 'string' ? raw.text.trim() : ''
  const history = Array.isArray(raw.history) ? (raw.history as Turn[]).slice(-30) : []
  const wantsContext = raw.patientContext !== false // default true
  const openingPromptSent = raw.openingPromptSent === true
  const guidanceContext: GuidanceContext = {
    checkpoint:
      raw.checkpoint === 'final' || raw.checkpoint === 'partial'
        ? raw.checkpoint
        : undefined,
    questions: Array.isArray(raw.guidanceQuestions)
      ? raw.guidanceQuestions.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    gaps: Array.isArray(raw.coverageGaps)
      ? raw.coverageGaps.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    coverageSummary:
      typeof raw.coverageSummary === 'string' && raw.coverageSummary.trim().length > 0
        ? raw.coverageSummary.trim()
        : undefined,
  }
  const isGuidedClarification = guidanceContext.questions.length > 0 || guidanceContext.gaps.length > 0

  // Greeting (no text) — fetch patient name for personalization
  if (!userText) {
    const openingQuestion = guidanceContext.questions[0]
      ? shortenQuestionForVoice(guidanceContext.questions[0])
      : ''
    let greeting = isGuidedClarification
      ? 'Estoy revisando tu historia clínica y quiero hacerte una pregunta breve para completar la información.'
      : 'Hola, soy el asistente de AutaMedica. Contame, ¿qué te trae hoy a la consulta?'

    if (wantsContext) {
      try {
        const admin = createAstroAdminClient()
        const { data: profile } = await admin
          .from('profiles')
          .select('first_name')
          .eq('user_id', context.userId)
          .single()
        if (profile?.first_name) {
          greeting = isGuidedClarification
            ? `Hola ${profile.first_name}. ${openingQuestion || 'Necesito hacerte un par de preguntas para completar algunos detalles clínicos.'}`
            : `Hola ${profile.first_name}, soy el asistente de AutaMedica. Contame, ¿qué te trae hoy a la consulta?`
        }
      } catch { /* use default greeting */ }
    }

    if (isGuidedClarification && !greeting.includes('?') && openingQuestion) {
      greeting = `Necesito una aclaración breve. ${openingQuestion}`
    }

    return json({
      success: true,
      data: { text: greeting, history: [], isComplete: false, turnCount: 1, modelTurnCount: 1 },
    })
  }

  // Build conversation
  const turns: Turn[] = [...history, { role: 'user', text: userText }]
  const userTurns = turns.filter(t => t.role === 'user').length
  if (userTurns > 15) {
    return json({ success: false, error: 'conversation_too_long' }, 429)
  }

  const apiKey = resolveServerEnv('GEMINI_API_KEY')
  if (!apiKey) return json({ success: false, error: 'ai_not_configured' }, 503)

  // Fetch patient context on first real message (history empty = first turn)
  let patientInfo: { name: string; age: number; completedSections: string[]; sectionData?: Record<string, Record<string, unknown>> } | undefined
  if (wantsContext && history.length === 0) {
    try {
      const admin = createAstroAdminClient()
      const [profileRes, patientRes, anamnesisRes] = await Promise.all([
        admin.from('profiles').select('first_name, last_name').eq('user_id', context.userId).single(),
        admin.from('patients').select('birth_date').eq('id', context.patientId).single(),
        admin.from('anamnesis').select('id').eq('patient_id', context.patientId).maybeSingle(),
      ])

      const profile = profileRes.data
      const patient = patientRes.data
      if (profile) {
        const birthDate = patient?.birth_date
        const age = birthDate
          ? Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : 0
        const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ')

        let completedSections: string[] = []
        const sectionData: Record<string, Record<string, unknown>> = {}
        if (anamnesisRes.data?.id) {
          const { data: sections } = await admin
            .from('anamnesis_sections')
            .select('section, data')
            .eq('anamnesis_id', anamnesisRes.data.id)
            .eq('completed', true)
          completedSections = sections?.map(s => s.section) ?? []
          for (const s of sections ?? []) {
            if (s.data && typeof s.data === 'object') {
              sectionData[s.section] = s.data as Record<string, unknown>
            }
          }
        }

        patientInfo = { name, age, completedSections, sectionData }
      }
    } catch (err) {
      logger.warn('[live-relay] Failed to fetch patient context', err)
    }
  }

  const systemPrompt = buildSystemInstruction(
    patientInfo,
    isGuidedClarification ? guidanceContext : undefined,
  )
  const contents = turns.map(t => ({
    role: t.role === 'user' ? 'user' : 'model',
    parts: [{ text: t.text }],
  }))

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${getQuestionsModelName()}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      },
    )
    clearTimeout(timeout)

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => 'unknown')
      logger.error('[live-relay] Gemini error', { status: resp.status, body: errBody.slice(0, 300) })
      return json({ success: false, error: 'ai_error' }, 502)
    }

    const geminiResult = await resp.json() as Record<string, unknown>
    const candidates = Array.isArray(geminiResult.candidates) ? geminiResult.candidates : []
    const firstCandidate = candidates[0] as Record<string, unknown> | undefined
    const contentObj = firstCandidate?.content as Record<string, unknown> | undefined
    const partsArr = Array.isArray(contentObj?.parts) ? contentObj.parts : []
    let modelText = (typeof partsArr[0]?.text === 'string' ? partsArr[0].text : '') as string

    // Check for completion signal
    const hasCompletionTag = modelText.includes(COMPLETION_TAG)

    // Extract structured fields if present
    let extractedFields: Record<string, string> | null = null
    if (hasCompletionTag) {
      const jsonMatch = modelText.match(/```json\s*(\{[\s\S]*?\})\s*```/) || modelText.match(/(\{"extractedFields"[\s\S]*?\}\})/)
      if (jsonMatch?.[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1])
          extractedFields = parsed.extractedFields ?? parsed
        } catch { /* ignore parse errors */ }
      }
      // Clean the text: remove tag, JSON block, code fences
      modelText = modelText
        .replace(COMPLETION_TAG, '')
        .replace(/```json[\s\S]*?```/g, '')
        .replace(/\{"extractedFields"[\s\S]*?\}\}/g, '')
        .trim()
    }

    const updatedHistory: Turn[] = [
      ...turns,
      ...(modelText ? [{ role: 'model' as const, text: modelText }] : []),
    ]

    const modelTurnCount = updatedHistory.filter(t => t.role === 'model').length + (openingPromptSent ? 1 : 0)
    const maxTurns = isGuidedClarification ? 4 : MAX_MODEL_TURNS
    const isComplete = hasCompletionTag || modelTurnCount >= maxTurns

    // Log conversation turn for monitoring
    logger.info('[live-relay] Turn', {
      patientId: context.patientId,
      modelTurn: modelTurnCount,
      userText: userText.slice(0, 100),
      aiText: modelText.slice(0, 100),
      isComplete,
      hasExtractedFields: !!extractedFields,
    })

    return json({
      success: true,
      data: {
        text: modelText || 'No pude entender. ¿Podrías repetirlo?',
        history: updatedHistory,
        isComplete,
        turnCount: updatedHistory.length + (openingPromptSent ? 1 : 0),
        modelTurnCount,
        ...(extractedFields && { extractedFields }),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error('[live-relay] Request failed', { msg })
    return json({ success: false, error: 'ai_error' }, 500)
  }
}
