/**
 * API: Gemini Live session — ephemeral token approach.
 * Generates a short-lived token so the browser can connect DIRECTLY to Gemini Live API.
 * No proxy needed — lower latency, no DO WebSocket relay issues.
 *
 * POST /api/patients/anamnesis/live-token
 */
import type { APIRoute } from 'astro'
import { GoogleGenAI } from '@google/genai'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import {
  buildGeminiLiveSessionConfig,
  type GeminiLiveCheckpoint,
} from '@/lib/patients/server/gemini-live-session'
import { logger } from '@autamedica/shared'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** In-memory rate limit: 100 live sessions per patient per hour (increased for testing) */
const LIVE_LIMIT = 100
const RATE_WINDOW_MS = 3_600_000
const liveRateMap = new Map<string, { count: number; resetAt: number }>()

function evictExpiredEntries() {
  const now = Date.now()
  for (const [key, entry] of liveRateMap) {
    if (now >= entry.resetAt) liveRateMap.delete(key)
  }
}
if (typeof globalThis !== 'undefined') {
  setInterval(evictExpiredEntries, 600_000).unref?.()
}

function resolveGeminiKey(runtimeEnv?: Record<string, unknown> | null): string | undefined {
  if (runtimeEnv?.GEMINI_API_KEY && typeof runtimeEnv.GEMINI_API_KEY === 'string') return runtimeEnv.GEMINI_API_KEY
  if (import.meta.env?.GEMINI_API_KEY) return String(import.meta.env.GEMINI_API_KEY)
  // eslint-disable-next-line no-restricted-properties -- fallback for non-Astro runtimes (edge functions, workers)
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) return String(process.env.GEMINI_API_KEY)
  return undefined
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
  runtime?: { env?: Record<string, unknown> }
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

  const apiKey = resolveGeminiKey(locals?.runtime?.env)
  if (!apiKey) {
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
    runtimeEnv: locals?.runtime?.env,
  })

  // Generate ephemeral token — browser connects DIRECTLY to Gemini, no proxy.
  try {
    const client = new GoogleGenAI({ apiKey })
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString()
    const newSessionExpireTime = new Date(now + 2 * 60 * 1000).toISOString()

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        httpOptions: { apiVersion: 'v1alpha' },
      },
    })

    logger.info('[live-token] Ephemeral token created', {
      patientId: context.patientId,
      tokenName: token.name?.slice(0, 20),
    })

    return json({
      success: true,
      data: {
        ephemeralToken: token.name,
        model: 'gemini-3.1-flash-live-preview',
        sessionConfig,
      },
    })
  } catch (err) {
    logger.error('[live-token] Failed to create ephemeral token', err)
    // Fallback: return the worker WS URL (old approach) so it still works
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
}
