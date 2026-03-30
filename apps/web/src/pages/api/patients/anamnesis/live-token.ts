/**
 * API: Secure Gemini API key delivery for Live API WebSocket.
 * Browser connects directly to Gemini Live WS — this endpoint
 * provides the key only to authenticated patients, rate-limited.
 *
 * GET /api/patients/anamnesis/live-token
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

/** In-memory rate limit: 3 live sessions per patient per hour */
const LIVE_LIMIT = 3
const liveRateMap = new Map<string, { count: number; resetAt: number }>()

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return json({ success: false, error: 'unauthorized' }, 401)

  // Rate limit
  const now = Date.now()
  const entry = liveRateMap.get(context.patientId)
  if (entry && now < entry.resetAt && entry.count >= LIVE_LIMIT) {
    return json({ success: false, error: 'rate_limit_exceeded' }, 429)
  }
  if (!entry || now >= (entry?.resetAt ?? 0)) {
    liveRateMap.set(context.patientId, { count: 1, resetAt: now + 3_600_000 })
  } else {
    entry.count++
  }

  const apiKey = resolveServerEnv('GEMINI_API_KEY')
  if (!apiKey) {
    return json({ success: false, error: 'ai_not_configured' }, 503)
  }

  logger.info('[live-token] Token issued', { patientId: context.patientId })

  return json({
    success: true,
    data: {
      wsUrl: `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`,
      model: 'models/gemini-3.1-flash-live-preview',
    },
  })
}
