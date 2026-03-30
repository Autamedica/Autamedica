/**
 * API: Server-side relay for Gemini Live audio.
 * Keeps API key server-side. Browser sends audio chunks,
 * server proxies to Gemini and returns text + audio response.
 *
 * POST /api/patients/anamnesis/live-relay
 * Body: { action: 'start' | 'audio' | 'end', audio?: string (base64), sessionId?: string }
 *
 * This is a simplified HTTP relay (not WebSocket) because
 * Cloudflare Workers don't support outbound WebSocket connections.
 * Uses Gemini's REST generateContent endpoint with audio input.
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

/** In-memory conversation store (per session) */
const sessions = new Map<string, { turns: Array<{ role: string; text: string }>; createdAt: number }>()

// Cleanup old sessions every 5 min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) sessions.delete(id)
  }
}, 5 * 60_000)

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return json({ success: false, error: 'unauthorized' }, 401)

  const raw = await request.json().catch(() => ({})) as Record<string, unknown>
  const action = raw.action as string

  if (action === 'start') {
    // Create new session
    const sessionId = `${context.patientId}-${Date.now()}`
    sessions.set(sessionId, { turns: [], createdAt: Date.now() })
    return json({ success: true, data: { sessionId, greeting: '¿Qué te trae hoy a la consulta?' } })
  }

  const sessionId = raw.sessionId as string
  if (!sessionId || !sessions.has(sessionId)) {
    return json({ success: false, error: 'invalid_session' }, 400)
  }

  const session = sessions.get(sessionId)
  if (!session) return json({ success: false, error: 'session_expired' }, 410)

  if (action === 'message') {
    const userText = typeof raw.text === 'string' ? raw.text.trim() : ''
    if (!userText) return json({ success: false, error: 'empty_message' }, 400)

    // Add user message to conversation
    session.turns.push({ role: 'user', text: userText })

    // Build Gemini request with full conversation history
    const apiKey = resolveServerEnv('GEMINI_API_KEY')
    if (!apiKey) return json({ success: false, error: 'ai_not_configured' }, 503)

    const contents = session.turns.map(t => ({
      role: t.role === 'user' ? 'user' : 'model',
      parts: [{ text: t.text }],
    }))

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents,
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 1024,
              thinkingConfig: { thinkingBudget: 512 },
            },
          }),
        },
      )

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => 'unknown')
        logger.error('[live-relay] Gemini error', { status: resp.status, body: errBody })
        return json({ success: false, error: 'ai_error' }, 502)
      }

      const geminiResult = await resp.json() as Record<string, unknown>
      const candidates = Array.isArray(geminiResult.candidates) ? geminiResult.candidates : []
      const firstCandidate = candidates[0] as Record<string, unknown> | undefined
      const contentObj = firstCandidate?.content as Record<string, unknown> | undefined
      const partsArr = Array.isArray(contentObj?.parts) ? contentObj.parts : []
      const modelText = (typeof partsArr[0]?.text === 'string' ? partsArr[0].text : '') as string

      if (modelText) {
        session.turns.push({ role: 'model', text: modelText as string })
      }

      return json({
        success: true,
        data: {
          text: modelText || 'No pude entender. ¿Podrías repetirlo?',
          turnCount: session.turns.length,
          isComplete: session.turns.filter(t => t.role === 'model').length >= 10,
        },
      })
    } catch (err) {
      logger.error('[live-relay] Request failed', err)
      return json({ success: false, error: 'ai_error' }, 500)
    }
  }

  if (action === 'end') {
    const turns = session.turns
    sessions.delete(sessionId)
    return json({
      success: true,
      data: {
        transcript: turns,
        turnCount: turns.length,
      },
    })
  }

  return json({ success: false, error: 'invalid_action' }, 400)
}
