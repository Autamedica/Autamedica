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

async function hasActiveTriageSession(
  admin: ReturnType<typeof createAstroAdminClient>,
  phone: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('whatsapp_triage_sessions')
    .select('session_id')
    .eq('patient_phone', phone)
    .eq('status', 'active')
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error('[openclaw-webhook] Failed to load triage session', { phone, error })
    return false
  }

  return Boolean(data?.session_id)
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

  if (await hasActiveTriageSession(admin, from)) {
    if (message_id) {
      await markInboundMessage(admin, message_id, {
        status: 'processed',
        processed_at: new Date().toISOString(),
        webhook_result: { action: 'triage_reply' },
        last_error: null,
      })
    }

    openclawService.handleTriageReply(admin, from, message).catch(err =>
      console.error('[openclaw-webhook] triage reply error:', err)
    )
    return jsonOk({ action: 'triage_reply', message_id })
  }

  const response = parsePatientResponse(message)
  if (!response) {
    // Marcar como procesado ANTES de enviar respuesta (evita duplicacion)
    if (message_id) {
      await markInboundMessage(admin, message_id, {
        status: "processed",
        processed_at: new Date().toISOString(),
        webhook_result: { action: "menu_fallback" },
        last_error: null,
      });
    }
    // Enviar menu principal para cualquier mensaje no reconocido (fire-and-forget)
    openclawService.handleMainMenu(admin, from).catch(err =>
      console.error('[openclaw-webhook] fallback menu error:', err)
    );
    return jsonOk({ action: "menu_fallback", message_id });
  }

  try {
    let result: { action: string; [key: string]: unknown }

    switch (response) {
      // ==========================================
      // NUEVAS OPCIONES DEL MENU
      // ==========================================
      case 'menu_schedule':
        if (message_id) { await markInboundMessage(admin, message_id, { status: 'processed', processed_at: new Date().toISOString(), webhook_result: { action: 'menu_schedule' }, last_error: null }); }
        openclawService.handleMenuSchedule(admin, from).catch(err => console.error('menu_schedule:', err));
        result = { action: 'menu_schedule', message: 'sent' };
        break

      case 'menu_view':
        if (message_id) { await markInboundMessage(admin, message_id, { status: 'processed', processed_at: new Date().toISOString(), webhook_result: { action: 'menu_view' }, last_error: null }); }
        openclawService.handleMenuView(admin, from).catch(err => console.error('menu_view:', err));
        result = { action: 'menu_view', message: 'sent' };
        break

      case 'menu_advisor':
        if (message_id) { await markInboundMessage(admin, message_id, { status: 'processed', processed_at: new Date().toISOString(), webhook_result: { action: 'menu_advisor' }, last_error: null }); }
        openclawService.handleMenuAdvisor(admin, from).catch(err => console.error('menu_advisor:', err));
        result = { action: 'menu_advisor', message: 'sent' };
        break

      case 'health_check':
        if (message_id) { await markInboundMessage(admin, message_id, { status: 'processed', processed_at: new Date().toISOString(), webhook_result: { action: 'health_check' }, last_error: null }); }
        openclawService.handleHealthCheck(admin, from).catch(err => console.error('health_check:', err));
        result = { action: 'health_check', message: 'sent' };
        break

      case 'anamnesis_audio':
        if (message_id) { await markInboundMessage(admin, message_id, { status: 'processed', processed_at: new Date().toISOString(), webhook_result: { action: 'anamnesis_audio_prompt' }, last_error: null }); }
        openclawService.handleAnamnesisAudioPrompt(admin, from).catch(err => console.error('anamnesis_audio:', err));
        result = { action: 'anamnesis_audio_prompt', message: 'sent' };
        break

      // ==========================================
      // LEGACY: recordatorios y waitlist
      // ==========================================
      case 'accepted':
        if (message_id) {
          await markInboundMessage(admin, message_id, {
            status: 'processed',
            processed_at: new Date().toISOString(),
            webhook_result: { action: 'accepted' },
            last_error: null,
          });
        }
        result = { ...(await openclawService.handleWaitlistAcceptance(admin, from)) }
        break

      case 'confirmed':
      case 'cancelled':
        if (message_id) {
          await markInboundMessage(admin, message_id, {
            status: 'processed',
            processed_at: new Date().toISOString(),
            webhook_result: { action: response },
            last_error: null,
          });
        }
        result = { ...(await openclawService.handleConfirmOrCancel(admin, from, response)) }
        break

      default:
        result = { action: 'unhandled', raw_response: response }
    }

    // already marked as processed before sending response

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
