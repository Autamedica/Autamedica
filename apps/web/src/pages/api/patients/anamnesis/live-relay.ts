/**
 * API: Stateless Gemini conversation relay for voice anamnesis.
 * Each request includes full conversation history — no server-side state.
 * This works reliably on Cloudflare Workers (no Map persistence needed).
 *
 * POST /api/patients/anamnesis/live-relay
 * Body: { text: string, history?: Array<{ role: 'user'|'model', text: string }> }
 * Returns: { text: string, history: Array<...> }
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { resolveServerEnv } from '@/lib/patients/server/ai-provider'
import { logger } from '@autamedica/shared'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const SYSTEM_INSTRUCTION = `Sos un asistente médico de AutaMedica. Tu rol es hacer la anamnesis (historia clínica) del paciente de forma conversacional y empática.

REGLAS:
- Hablá en español argentino informal (voseo), con tono cálido y profesional
- Hacé UNA pregunta por vez
- Preguntas cortas y claras, como hablaría un médico en consultorio
- Cubrí: motivo de consulta, síntomas actuales, duración, intensidad, antecedentes relevantes, medicación actual, alergias
- Si detectás banderas rojas (dolor de pecho, dificultad para respirar, pérdida de consciencia), mencionalo con calma
- NO diagnostiques ni sugieras tratamientos
- Después de 6-8 preguntas, hacé un resumen breve
- Máximo 10 preguntas en total`

/** Max turns per conversation */
const MAX_TURNS = 30

interface Turn {
  role: 'user' | 'model'
  text: string
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return json({ success: false, error: 'unauthorized' }, 401)

  const raw = await request.json().catch(() => ({})) as Record<string, unknown>
  const userText = typeof raw.text === 'string' ? raw.text.trim() : ''
  const history = Array.isArray(raw.history) ? (raw.history as Turn[]).slice(-MAX_TURNS) : []

  if (!userText) {
    // No text = greeting request
    return json({
      success: true,
      data: {
        text: '¿Qué te trae hoy a la consulta?',
        history: [],
        isComplete: false,
      },
    })
  }

  // Build conversation with user's new message
  const turns: Turn[] = [...history, { role: 'user', text: userText }]

  // Rate limit by turn count
  const userTurns = turns.filter(t => t.role === 'user').length
  if (userTurns > 15) {
    return json({ success: false, error: 'conversation_too_long' }, 429)
  }

  const apiKey = resolveServerEnv('GEMINI_API_KEY')
  if (!apiKey) return json({ success: false, error: 'ai_not_configured' }, 503)

  const contents = turns.map(t => ({
    role: t.role === 'user' ? 'user' : 'model',
    parts: [{ text: t.text }],
  }))

  try {
    // 25s timeout to respond before Cloudflare's 30s worker limit
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)

    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 512,
          },
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
    const modelText = (typeof partsArr[0]?.text === 'string' ? partsArr[0].text : '') as string

    const updatedHistory: Turn[] = [
      ...turns,
      ...(modelText ? [{ role: 'model' as const, text: modelText }] : []),
    ]

    const modelTurnCount = updatedHistory.filter(t => t.role === 'model').length

    return json({
      success: true,
      data: {
        text: modelText || 'No pude entender. ¿Podrías repetirlo?',
        history: updatedHistory,
        isComplete: modelTurnCount >= 10,
        turnCount: updatedHistory.length,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const name = err instanceof Error ? err.name : 'unknown'
    logger.error('[live-relay] Request failed', { name, msg })
    return json({ success: false, error: 'ai_error', debug: { name, msg } }, 500)
  }
}
