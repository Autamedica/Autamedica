import { handleTurnCredentials } from '@autamedica/telemedicine/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const result = await handleTurnCredentials({
    keyId: process.env.CLOUDFLARE_CALLS_TURN_KEY_ID,
    token: process.env.CLOUDFLARE_CALLS_TURN_TOKEN,
  })
  return NextResponse.json(result.body, { status: result.status, headers: result.headers })
}
