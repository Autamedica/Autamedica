import { logger } from '@autamedica/shared'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// TTL en segundos para las credenciales TURN efímeras (24 horas)
const TURN_TTL = 86400

export async function GET() {
  const keyId = process.env.CLOUDFLARE_CALLS_TURN_KEY_ID
  const token = process.env.CLOUDFLARE_CALLS_TURN_TOKEN

  if (!keyId || !token) {
    logger.warn('[turn-credentials] CLOUDFLARE_CALLS_TURN_KEY_ID o CLOUDFLARE_CALLS_TURN_TOKEN no configurados — usando STUN fallback')
    return NextResponse.json(
      {
        ok: true,
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302'] },
          { urls: ['stun:stun1.l.google.com:19302'] },
        ],
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
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
      logger.error('[turn-credentials] Cloudflare Calls API error', new Error(errorText))
      return NextResponse.json(
        { ok: false, error: 'Failed to generate TURN credentials' },
        { status: 502 }
      )
    }

    const data = await response.json() as { iceServers?: RTCIceServer[] }

    return NextResponse.json(
      { ok: true, iceServers: data.iceServers ?? [] },
      {
        headers: {
          // Cache privado: credenciales válidas para el browser que las pidió
          'Cache-Control': `private, max-age=${TURN_TTL - 300}`,
        },
      }
    )
  } catch (err) {
    logger.error('[turn-credentials] Error generando credenciales TURN', err as Error)
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
