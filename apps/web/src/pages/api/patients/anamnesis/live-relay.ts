/**
 * API: Stateless Gemini conversation relay for voice anamnesis.
 * Deterministic 8-block medical interview protocol.
 * Each request includes full conversation history — no server-side state.
 *
 * POST /api/patients/anamnesis/live-relay
 * Body: { text: string, history?: Turn[], patientContext?: boolean }
 * Returns: { text: string, history: Turn[], isComplete: boolean, extractedFields?: Record }
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { resolveServerEnv } from '@/lib/patients/server/ai-provider'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Build system instruction with optional patient context */
function buildSystemInstruction(patientInfo?: { name: string; age: number; completedSections: string[] }): string {
  const context = patientInfo
    ? `\nCONTEXTO DEL PACIENTE:\n- Nombre: ${patientInfo.name}\n- Edad: ${patientInfo.age} años\n- Secciones ya completadas: ${patientInfo.completedSections.length > 0 ? patientInfo.completedSections.join(', ') : 'ninguna'}\nSi ya tiene secciones completadas, enfocate en lo que falta o pudo haber cambiado.\n`
    : ''

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

  // Greeting (no text) — fetch patient name for personalization
  if (!userText) {
    let greeting = 'Hola, soy el asistente de AutaMedica. Contame, ¿qué te trae hoy a la consulta?'

    if (wantsContext) {
      try {
        const admin = createAstroAdminClient()
        const { data: profile } = await admin
          .from('profiles')
          .select('first_name')
          .eq('user_id', context.userId)
          .single()
        if (profile?.first_name) {
          greeting = `Hola ${profile.first_name}, soy el asistente de AutaMedica. Contame, ¿qué te trae hoy a la consulta?`
        }
      } catch { /* use default greeting */ }
    }

    return json({
      success: true,
      data: { text: greeting, history: [], isComplete: false, turnCount: 0 },
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
  let patientInfo: { name: string; age: number; completedSections: string[] } | undefined
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
        if (anamnesisRes.data?.id) {
          const { data: sections } = await admin
            .from('anamnesis_sections')
            .select('section')
            .eq('anamnesis_id', anamnesisRes.data.id)
            .eq('completed', true)
          completedSections = sections?.map(s => s.section) ?? []
        }

        patientInfo = { name, age, completedSections }
      }
    } catch (err) {
      logger.warn('[live-relay] Failed to fetch patient context', err)
    }
  }

  const systemPrompt = buildSystemInstruction(patientInfo)
  const contents = turns.map(t => ({
    role: t.role === 'user' ? 'user' : 'model',
    parts: [{ text: t.text }],
  }))

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)

    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
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

    const modelTurnCount = updatedHistory.filter(t => t.role === 'model').length
    const isComplete = hasCompletionTag || modelTurnCount >= MAX_MODEL_TURNS

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
        turnCount: updatedHistory.length,
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
