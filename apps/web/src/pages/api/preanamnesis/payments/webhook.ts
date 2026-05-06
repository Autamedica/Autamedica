import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { createAstroAdminClient } from '@/lib/supabase'
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service'

const MERCADOPAGO_API = 'https://api.mercadopago.com'

type MercadoPagoPaymentDetail = {
  id: number | string
  status: string
  transaction_amount: number
  currency_id?: string | null
  payment_method_id?: string | null
  external_reference?: string | null
  metadata?: Record<string, unknown> | null
}

function getMercadoPagoToken(): string {
  const token = getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN') ?? import.meta.env.MERCADOPAGO_ACCESS_TOKEN
  if (!token) throw new Error('payment_access_token_missing')
  return token
}

function mapPaymentStatus(status: string): string {
  const mapping: Record<string, string> = {
    approved: 'paid',
    rejected: 'rejected',
    refunded: 'refunded',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    pending: 'pending_payment',
    in_process: 'pending_payment',
  }

  return mapping[status] ?? 'pending_payment'
}

function majorUnitToCents(amount: number): number {
  return Math.round(amount * 100)
}

function resolvePreanamnesisId(payment: MercadoPagoPaymentDetail): string | null {
  const metadataId = payment.metadata?.preanamnesis_id
  if (typeof metadataId === 'string' && metadataId.length > 0) return metadataId

  const reference = payment.external_reference
  if (!reference) return null

  const [kind, id] = reference.split('|')
  return kind === 'preanamnesis' && id ? id : null
}

async function fetchPayment(paymentId: string): Promise<MercadoPagoPaymentDetail> {
  const response = await fetch(`${MERCADOPAGO_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${getMercadoPagoToken()}`,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MercadoPago API ${response.status}: ${body}`)
  }

  return response.json() as Promise<MercadoPagoPaymentDetail>
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url)
    const signature = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id')
    const rawBody = await request.text()

    let payload: {
      type?: string
      data?: { id?: string }
    }

    try {
      payload = rawBody.trim()
        ? JSON.parse(rawBody) as { type?: string; data?: { id?: string } }
        : {}
    } catch {
      return badRequest('invalid_json')
    }

    const type = payload.type ?? url.searchParams.get('type') ?? undefined
    const dataId = payload.data?.id ?? url.searchParams.get('data.id') ?? undefined

    if (!dataId || !type) return badRequest('missing_type_or_data_id')

    const isValidSignature = await appointmentPaymentsService.validateWebhookSignature({
      signature,
      requestId,
      dataId,
    })

    if (!isValidSignature) {
      logger.warn('[preanamnesis-payments/webhook] Invalid signature')
      return unauthorized('invalid_webhook_signature')
    }

    if (type !== 'payment') {
      return jsonOk({ received: true, ignored: type })
    }

    const supabase = createAstroAdminClient(locals.runtime?.env)
    const payment = await fetchPayment(dataId)
    const preanamnesisId = resolvePreanamnesisId(payment)

    if (!preanamnesisId) {
      logger.warn('[preanamnesis-payments/webhook] Payment without preanamnesis reference', {
        paymentId: payment.id,
        externalReference: payment.external_reference,
      })
      return jsonOk({ received: true, ignored: 'missing_preanamnesis_reference' })
    }

    const status = mapPaymentStatus(payment.status)
    const paidAt = status === 'paid' ? new Date().toISOString() : null

    const { error: orderError } = await (supabase as any)
      .from('medical_review_orders')
      .update({
        status,
        provider_payment_id: String(payment.id),
        amount_cents: majorUnitToCents(payment.transaction_amount),
        currency: payment.currency_id ?? 'ARS',
        paid_at: paidAt,
        metadata: {
          ...(payment.metadata ?? {}),
          payment_method_id: payment.payment_method_id ?? null,
          external_reference: payment.external_reference ?? null,
          mp_status: payment.status,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('preanamnesis_id', preanamnesisId)

    if (orderError) throw orderError

    if (status === 'paid') {
      const { error: sessionError } = await (supabase as any)
        .from('preanamnesis_sessions')
        .update({
          status: 'paid',
          updated_at: new Date().toISOString(),
        })
        .eq('id', preanamnesisId)

      if (sessionError) throw sessionError
    }

    return jsonOk({ received: true, preanamnesisId, status })
  } catch (error) {
    logger.error('[preanamnesis-payments/webhook] POST error', error)
    return internalError('webhook_processing_failed')
  }
}
