/**
 * Webhook endpoint: OpenClaw (WhatsApp/Telegram) patient responses.
 * Auth: Bearer token legacy o firma HMAC con timestamp.
 */
import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { parsePatientResponse } from '@autamedica/scheduling'
import { openclawService } from '@/lib/webhooks/services/openclaw.service'

const WEBHOOK_SECRET = import.meta.env.OPENCLAW_WEBHOOK_SECRET ?? ''
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

function jsonOk(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: JSON_HEADERS })
}

function encodeHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return encodeHex(signature)
}

async function isSignedRequestValid(request: Request, rawBody: string): Promise<boolean> {
  const timestamp = request.headers.get('X-OpenClaw-Timestamp')
  const signature = request.headers.get('X-OpenClaw-Signature')
  if (!timestamp || !signature || !WEBHOOK_SECRET) return false

  const tsSeconds = Number(timestamp)
  if (!Number.isFinite(tsSeconds)) return false

  const age = Math.abs(Math.floor(Date.now() / 1000) - tsSeconds)
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false

  const expected = await signPayload(WEBHOOK_SECRET, `${timestamp}.${rawBody}`)
  return expected === signature
}

async function markInboundMessage(
  admin: ReturnType<typeof createAstroAdminClient>,
  messageId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from('appointment_inbound_messages')
    .update({
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq('id', messageId)

  if (error) {
    logger.error('[openclaw-webhook] Failed to update inbound message', { messageId, error })
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const rawBody = await request.text()
  const authHeader = request.headers.get('Authorization')
  const authOk = WEBHOOK_SECRET && authHeader === `Bearer ${WEBHOOK_SECRET}`
  const signatureOk = await isSignedRequestValid(request, rawBody)

  if (!WEBHOOK_SECRET || (!authOk && !signatureOk)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
  }

  let body: { from?: string; message?: string; channel?: string; message_id?: string }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS })
  }

  const { from, message, message_id } = body
  if (!from || !message) {
    return new Response(JSON.stringify({ error: 'Missing from or message' }), { status: 400, headers: JSON_HEADERS })
  }

  const admin = createAstroAdminClient(locals.runtime?.env)

  if (message_id) {
    const { data: inbound, error: inboundError } = await admin
      .from('appointment_inbound_messages')
      .select('id, status')
      .eq('id', message_id)
      .maybeSingle()

    if (inboundError) {
      logger.error('[openclaw-webhook] Failed to load inbound message', inboundError)
    }

    if (inbound?.status === 'processed' || inbound?.status === 'ignored') {
      return jsonOk({ action: inbound.status, message_id })
    }
  }

  const response = parsePatientResponse(message)
  if (!response) {
    if (message_id) {
      await markInboundMessage(admin, message_id, {
        status: 'ignored',
        processed_at: new Date().toISOString(),
        webhook_result: { action: 'ignored' },
        last_error: null,
      })
    }
    return jsonOk({ action: 'ignored', message_id })
  }

  try {
    const result = response === 'accepted'
      ? await openclawService.handleWaitlistAcceptance(admin, from)
      : await openclawService.handleConfirmOrCancel(admin, from, response)

    if (message_id) {
      await markInboundMessage(admin, message_id, {
        status: 'processed',
        processed_at: new Date().toISOString(),
        webhook_result: result,
        last_error: null,
      })
    }

    return jsonOk({ ...result, message_id })
  } catch (err) {
    logger.error('[openclaw-webhook] Error processing response', err)

    if (message_id) {
      await markInboundMessage(admin, message_id, {
        last_error: err instanceof Error ? err.message : 'Internal error',
        webhook_result: { error: err instanceof Error ? err.message : 'Internal error' },
      })
    }

    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: JSON_HEADERS })
  }
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-OpenClaw-Timestamp, X-OpenClaw-Signature',
    },
  })
}
