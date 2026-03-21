import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const result = await handleCloudflareCallsProxy(request, {
    appId: process.env.CLOUDFLARE_CALLS_APP_ID,
    appSecret: process.env.CLOUDFLARE_CALLS_APP_SECRET,
  })
  return NextResponse.json(result.body, { status: result.status, headers: result.headers })
}
