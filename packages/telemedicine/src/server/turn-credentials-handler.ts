/**
 * Framework-agnostic handler for generating TURN credentials.
 * Falls back to STUN-only if TURN not configured.
 */

import { logger } from '@autamedica/shared'

export interface TurnCredentialsEnv {
  keyId: string | undefined
  token: string | undefined
}

export interface HandlerResult {
  status: number
  body: unknown
  headers: Record<string, string>
}

const TURN_TTL = 86400

const STUN_FALLBACK = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
]

export async function handleTurnCredentials(
  env: TurnCredentialsEnv,
): Promise<HandlerResult> {
  const { keyId, token } = env

  if (!keyId || !token) {
    logger.warn('[turn-credentials] TURN not configured — using STUN fallback')
    return {
      status: 200,
      body: { ok: true, iceServers: STUN_FALLBACK },
      headers: { 'Cache-Control': 'no-store' },
    }
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: TURN_TTL }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('[turn-credentials] Cloudflare API error', new Error(errorText))
      return {
        status: 502,
        body: { ok: false, error: 'Failed to generate TURN credentials' },
        headers: {},
      }
    }

    const data = await response.json() as { iceServers?: RTCIceServer[] }

    return {
      status: 200,
      body: { ok: true, iceServers: data.iceServers ?? [] },
      headers: { 'Cache-Control': `private, max-age=${TURN_TTL - 300}` },
    }
  } catch (err) {
    logger.error('[turn-credentials] Error generating TURN credentials', err as Error)
    return {
      status: 500,
      body: { ok: false, error: 'Internal server error' },
      headers: {},
    }
  }
}
