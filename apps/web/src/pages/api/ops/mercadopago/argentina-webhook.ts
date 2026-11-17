import type { APIRoute } from 'astro'
import { getRuntimeEnvValue, primeRuntimeEnv } from '@/lib/runtime-env'
import { createMercadoPagoBrokerHeaders } from '@/lib/payments/mercadopago-broker-signature'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'

const API = 'https://api.mercadopago.com'
const PATIENT_RECONCILIATION_URL = 'https://paciente.autamedica.com/api/ops/mercadopago/verified-argentina-payment'

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, '0')).join('')
}

function parseSignature(value: string): { timestamp: string | null; signature: string | null } {
  return value.split(',').reduce((result, part) => {
    const [key, ...valueParts] = part.split('=')
    const entry = valueParts.join('=').trim()
    if (key?.trim() === 'ts') result.timestamp = entry
    if (key?.trim() === 'v1') result.signature = entry
    return result
  }, { timestamp: null, signature: null } as { timestamp: string | null; signature: string | null })
}

/** Argentina-only Mercado Pago webhook; account identity is checked against the MLA credential. */
export const POST: APIRoute = async ({ request, locals }) => {
  primeRuntimeEnv(locals.runtime?.env)
  const rawBody = await request.text()
  let payload: { type?: string; data?: { id?: string } }
  try {
    payload = rawBody.trim() ? JSON.parse(rawBody) as typeof payload : {}
  } catch {
    return badRequest('invalid_json')
  }

  const url = new URL(request.url)
  const type = payload.type ?? url.searchParams.get('type') ?? ''
  const paymentId = payload.data?.id ?? url.searchParams.get('data.id') ?? ''
  if (type !== 'payment' || !/^\d{1,20}$/.test(paymentId)) {
    return jsonOk({ received: true, ignored: true })
  }

  const signature = request.headers.get('x-signature') ?? ''
  const requestId = request.headers.get('x-request-id') ?? ''
  const parts = parseSignature(signature)
  const webhookSecret = (locals.runtime?.env?.MERCADOPAGO_WEBHOOK_SECRET as string | undefined)
    ?? getRuntimeEnvValue('MERCADOPAGO_WEBHOOK_SECRET')
  if (!webhookSecret || !requestId || !parts.timestamp || !parts.signature) {
    return unauthorized('mercadopago_webhook_signature_invalid')
  }

  const manifest = 'id:' + paymentId + ';request-id:' + requestId + ';ts:' + parts.timestamp + ';'
  const expected = await hmacHex(webhookSecret, manifest)
  if (!constantTimeEqual(expected, parts.signature.toLowerCase())) {
    return unauthorized('mercadopago_webhook_signature_invalid')
  }

  const token = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
    ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
  if (!token) return internalError('argentina_mercadopago_access_not_configured')

  try {
    const response = await fetch(API + '/v1/payments/' + encodeURIComponent(paymentId), {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) throw new Error('argentina_provider_payment_unavailable')

    const payment = await response.json() as {
      id?: string | number
      status?: string
      status_detail?: string
      transaction_amount?: number
      transaction_amount_refunded?: number
      currency_id?: string
      external_reference?: string
      date_approved?: string
      metadata?: Record<string, unknown>
    }
    const dispatchId = typeof payment.metadata?.dispatch_id === 'string' ? payment.metadata.dispatch_id : ''
    const referenceMatch = /^pharm:([0-9a-f-]{36})$/i.exec(payment.external_reference ?? '')
    if (
      payment.metadata?.payment_type !== 'pharmacy_consultation' ||
      payment.currency_id !== 'ARS' ||
      !dispatchId ||
      referenceMatch?.[1] !== dispatchId
    ) {
      return jsonOk({ received: true, ignored: true })
    }

    const safePayment = {
      id: String(payment.id),
      status: payment.status ?? 'pending',
      status_detail: payment.status_detail ?? null,
      transaction_amount: payment.transaction_amount ?? 0,
      transaction_amount_refunded: payment.transaction_amount_refunded ?? 0,
      currency_id: 'ARS',
      external_reference: payment.external_reference,
      date_approved: payment.date_approved ?? null,
      metadata: { payment_type: 'pharmacy_consultation', dispatch_id: dispatchId },
    }
    const forwardBody = JSON.stringify({ payment: safePayment })
    const pathname = '/api/ops/mercadopago/verified-argentina-payment'
    const headers = await createMercadoPagoBrokerHeaders('POST', pathname, forwardBody, locals.runtime?.env)
    const forwarded = await fetch(PATIENT_RECONCILIATION_URL, {
      method: 'POST',
      headers,
      body: forwardBody,
      signal: AbortSignal.timeout(12000),
    })
    if (!forwarded.ok) throw new Error('patient_payment_reconciliation_unavailable')
    return jsonOk({ received: true })
  } catch {
    return internalError('argentina_mercadopago_webhook_processing_failed')
  }
}
