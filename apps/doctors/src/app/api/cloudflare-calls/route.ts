/**
 * Proxy server-side para la API REST de Cloudflare Calls.
 * Mantiene APP_ID y APP_SECRET fuera del bundle del cliente.
 *
 * Body: { path: string; method?: string; body?: unknown }
 * Ejemplo: { path: "sessions/new", body: { sessionDescription: { type: "offer", sdp: "..." } } }
 */

import { logger } from '@autamedica/shared'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const CF_API_BASE = 'https://rtc.live.cloudflare.com/v1/apps'

export async function POST(request: Request) {
  const appId = process.env.CLOUDFLARE_CALLS_APP_ID
  const appSecret = process.env.CLOUDFLARE_CALLS_APP_SECRET

  if (!appId || !appSecret) {
    logger.warn('[cloudflare-calls] CLOUDFLARE_CALLS_APP_ID o CLOUDFLARE_CALLS_APP_SECRET no configurados')
    return NextResponse.json({ error: 'Cloudflare Calls not configured' }, { status: 503 })
  }

  let parsed: { path?: string; method?: string; body?: unknown }
  try {
    parsed = await request.json() as typeof parsed
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { path, method = 'POST', body } = parsed
  if (!path || typeof path !== 'string') {
    return NextResponse.json({ error: 'Missing "path" field' }, { status: 400 })
  }

  const url = `${CF_API_BASE}/${appId}/${path}`

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${appSecret}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const data: unknown = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    logger.error('[cloudflare-calls] Error proxying request', err as Error)
    return NextResponse.json({ error: 'Failed to reach Cloudflare Calls API' }, { status: 502 })
  }
}
