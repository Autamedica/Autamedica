/**
 * API: Gemini Live session config (NO API key exposed).
 * Returns the Worker WebSocket URL plus a server-built session contract.
 * The browser only forwards this contract to the Worker after WS open.
 *
 * GET /api/patients/anamnesis/live-token
 * POST /api/patients/anamnesis/live-token
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import {
  buildGeminiLiveSessionConfig,
  type GeminiLiveCheckpoint,
} from '@/lib/patients/server/gemini-live-session'
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
const RATE_WINDOW_MS = 3_600_000
const liveRateMap = new Map<string, { count: number; resetAt: number }>()

/** Evict expired entries periodically to prevent unbounded growth */
function evictExpiredEntries() {
  const now = Date.now()
  for (const [key, entry] of liveRateMap) {
    if (now >= entry.resetAt) liveRateMap.delete(key)
  }
}
// Run eviction every 10 minutes
if (typeof globalThis !== 'undefined') {
  setInterval(evictExpiredEntries, 600_000).unref?.()
}

export const GET: APIRoute = async ({ request, locals }) => {
  return issueLiveToken(request, locals)
}

export const POST: APIRoute = async ({ request, locals }) => {
  return issueLiveToken(request, locals)
}

interface AstroLocals {
  session?: { user?: { id?: string } } | null
  supabase?: unknown
}

interface LiveTokenRequestBody {
  checkpoint?: GeminiLiveCheckpoint
  guidanceQuestions?: string[]
  coverageGaps?: string[]
  coverageSummary?: string
}

async function issueLiveToken(request: Request, locals?: AstroLocals) {
  const context = await resolvePatientContext(request, locals)
  if (!context) return json({ success: false, error: 'unauthorized' }, 401)

  const now = Date.now()
  const entry = liveRateMap.get(context.patientId)
  if (entry && now < entry.resetAt && entry.count >= LIVE_LIMIT) {
    return json({ success: false, error: 'rate_limit_exceeded' }, 429)
  }
  if (!entry || now >= (entry?.resetAt ?? 0)) {
    liveRateMap.set(context.patientId, { count: 1, resetAt: now + RATE_WINDOW_MS })
  } else {
    entry.count++
  }

  if (!isAnamnesisExtractionConfigured()) {
    return json({ success: false, error: 'ai_not_configured' }, 503)
  }

  logger.info('[live-token] Session authorized', { patientId: context.patientId })

  let body: LiveTokenRequestBody = {}
  if (request.method === 'POST') {
    body = await request.json().catch(() => ({})) as LiveTokenRequestBody
  }

  const sessionConfig = await buildGeminiLiveSessionConfig({
    userId: context.userId,
    patientId: context.patientId,
    checkpoint:
      body.checkpoint === 'partial' || body.checkpoint === 'final'
        ? body.checkpoint
        : undefined,
    guidanceQuestions: body.guidanceQuestions,
    coverageGaps: body.coverageGaps,
    coverageSummary: body.coverageSummary,
  })

  // Return WebSocket URL to the signaling worker's Gemini Live proxy.
  // API key stays as a Worker secret. Session config is constructed server-side.
  const sessionId = crypto.randomUUID()
  const rawUrl = import.meta.env.PUBLIC_SIGNALING_URL
    ?? 'https://autamedica-signaling-server.marques-eduardo95466020.workers.dev'
  const signalingOrigin = new URL(rawUrl).origin

  return json({
    success: true,
    data: {
      wsUrl: `${signalingOrigin.replace(/^http/, 'ws')}/gemini-live?sessionId=${sessionId}`,
      sessionId,
      model: 'gemini-3.1-flash-live-preview',
      sessionConfig,
    },
  })
}
