/**
 * API: Gemini Live session config (NO API key exposed).
 * Returns only the model name and WS endpoint hostname.
 * The actual API key stays server-side.
 *
 * SECURITY: Previously this endpoint returned the full WS URL with
 * the API key as query param — exposing it to any browser DevTools user.
 * Now the browser must use /api/patients/anamnesis/live-relay for audio.
 *
 * GET /api/patients/anamnesis/live-token
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { isAnamnesisExtractionConfigured } from '@/lib/patients/server/ai-provider'
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

  if (!isAnamnesisExtractionConfigured()) {
    return json({ success: false, error: 'ai_not_configured' }, 503)
  }

  logger.info('[live-token] Session authorized', { patientId: context.patientId })

  // Return WebSocket URL to the signaling worker's Gemini Live proxy
  // API key is stored as a secret in the worker, never exposed to the browser
  const sessionId = crypto.randomUUID()
  const signalingHost = import.meta.env.PUBLIC_SIGNALING_URL
    ?? 'https://autamedica-signaling-server.marques-eduardo95466020.workers.dev'

  return json({
    success: true,
    data: {
      wsUrl: `${signalingHost.replace(/^http/, 'ws')}/gemini-live?sessionId=${sessionId}`,
      sessionId,
      model: 'gemini-3.1-flash-live-preview',
    },
  })
}
