/**
 * Framework-agnostic handler for proxying Cloudflare Calls API.
 * Apps wrap this with their framework's Response (Astro Response, standard Response, etc.)
 */

import { logger } from '@autamedica/shared'

export interface CloudflareCallsEnv {
  appId: string | undefined
  appSecret: string | undefined
}

export interface HandlerResult {
  status: number
  body: unknown
  headers?: Record<string, string>
}

const CF_API_BASE = 'https://rtc.live.cloudflare.com/v1/apps'
// Never use an arbitrary browser-provided URL as the upstream API path.
const ALLOWED_CF_PATH = /^sessions\/(?:new|[A-Za-z0-9._-]+\/(?:tracks\/new|tracks\/close|renegotiate))$/

export async function handleCloudflareCallsProxy(
  request: Request,
  env: CloudflareCallsEnv,
): Promise<HandlerResult> {
  const { appId, appSecret } = env

  if (!appId || !appSecret) {
    logger.warn('[cloudflare-calls] CLOUDFLARE_CALLS_APP_ID o CLOUDFLARE_CALLS_APP_SECRET no configurados')
    return { status: 503, body: { error: 'Cloudflare Calls not configured' } }
  }

  let parsed: { path?: string; method?: string; body?: unknown }
  try {
    parsed = await request.json() as typeof parsed
  } catch {
    return { status: 400, body: { error: 'Invalid JSON body' } }
  }

  const { path, method = 'POST', body } = parsed
  if (!path || typeof path !== 'string') {
    return { status: 400, body: { error: 'Missing "path" field' } }
  }
  const normalizedMethod = typeof method === 'string' ? method.toUpperCase() : ''
  if (!ALLOWED_CF_PATH.test(path) ||
      !((path === 'sessions/new' || path.endsWith('/tracks/new'))
        ? normalizedMethod === 'POST'
        : normalizedMethod === 'PUT')) {
    return { status: 400, body: { error: 'Invalid Cloudflare Calls operation' } }
  }

  const url = `${CF_API_BASE}/${appId}/${path}`

  try {
    const res = await fetch(url, {
      method: normalizedMethod,
      headers: {
        Authorization: `Bearer ${appSecret}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AutaMedica-Telemedicine-SFU/1.0',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const data: unknown = await res.json()
    return { status: res.status, body: data }
  } catch (err) {
    logger.error('[cloudflare-calls] Error proxying request', err as Error)
    return { status: 502, body: { error: 'Failed to reach Cloudflare Calls API' } }
  }
}
