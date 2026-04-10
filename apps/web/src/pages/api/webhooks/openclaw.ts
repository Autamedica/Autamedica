/**
 * Webhook endpoint: OpenClaw (WhatsApp/Telegram) patient responses.
 * Auth: Bearer token (server-to-server, no user session).
 */
import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { parsePatientResponse } from '@autamedica/scheduling'
import { openclawService } from '@/lib/webhooks/services/openclaw.service'

const WEBHOOK_SECRET = import.meta.env.OPENCLAW_WEBHOOK_SECRET ?? ''

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function jsonOk(data: Record<string, any>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: JSON_HEADERS })
}

export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization')
  if (!WEBHOOK_SECRET || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
  }

  let body: { from?: string; message?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS })
  }

  const { from, message } = body
  if (!from || !message) {
    return new Response(JSON.stringify({ error: 'Missing from or message' }), { status: 400, headers: JSON_HEADERS })
  }

  const response = parsePatientResponse(message)
  if (!response) {
    return jsonOk({ action: 'ignored' })
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = response === 'accepted'
      ? await openclawService.handleWaitlistAcceptance(admin, from)
      : await openclawService.handleConfirmOrCancel(admin, from, response)
    return jsonOk(result)
  } catch (err) {
    logger.error('[openclaw-webhook] Error processing response', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: JSON_HEADERS })
  }
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  })
}
