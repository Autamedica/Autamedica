import type { APIRoute } from 'astro'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { verifyMercadoPagoBrokerRequest } from '@/lib/payments/mercadopago-broker-signature'
import { badRequest, internalError, jsonOk, serviceUnavailable, unauthorized } from '@/lib/api-helpers'

const API = 'https://api.mercadopago.com'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAYMENT_ID = /^\d{1,20}$/

interface MercadoPagoPayment {
  id: number | string
  status: string
  status_detail?: string | null
  transaction_amount: number
  transaction_amount_refunded?: number | null
  currency_id: string
  external_reference?: string | null
  date_approved?: string | null
  metadata?: Record<string, unknown> | null
}

function safePayment(payment: MercadoPagoPayment, dispatchId: string) {
  if (
    !PAYMENT_ID.test(String(payment.id)) ||
    payment.currency_id !== 'ARS' ||
    payment.external_reference !== 'pharm:' + dispatchId ||
    payment.metadata?.payment_type !== 'pharmacy_consultation' ||
    payment.metadata?.dispatch_id !== dispatchId
  ) return null

  return {
    id: String(payment.id),
    status: payment.status,
    status_detail: payment.status_detail ?? null,
    transaction_amount: payment.transaction_amount,
    transaction_amount_refunded: payment.transaction_amount_refunded ?? 0,
    currency_id: payment.currency_id,
    external_reference: payment.external_reference,
    date_approved: payment.date_approved ?? null,
    metadata: { payment_type: 'pharmacy_consultation', dispatch_id: dispatchId },
  }
}

async function providerFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(API + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(12000),
  })
}

/** Argentina Mercado Pago broker; runs on empresa.autamedica.com (MLA). */
export const POST: APIRoute = async ({ request, locals }) => {
  const rawBody = await request.text()
  if (!await verifyMercadoPagoBrokerRequest(request, rawBody, locals.runtime?.env)) {
    return unauthorized('mercadopago_broker_signature_invalid')
  }

  let body: { action?: string; dispatchId?: string; amountMinor?: number; paymentId?: string }
  try {
    body = JSON.parse(rawBody) as typeof body
  } catch {
    return badRequest('invalid_json')
  }

  const dispatchId = typeof body.dispatchId === 'string' ? body.dispatchId : ''
  if (!UUID.test(dispatchId)) return badRequest('invalid_dispatch_id')

  const token = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
    ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
  if (!token) return serviceUnavailable('argentina_mercadopago_access_not_configured')

  try {
    if (body.action === 'create_preference') {
      const amountMinor = Number(body.amountMinor)
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        return badRequest('invalid_argentina_payment_amount')
      }
      const response = await providerFetch('/checkout/preferences', token, {
        method: 'POST',
        body: JSON.stringify({
          items: [{
            title: 'AutaMedica - Consulta médica',
            quantity: 1,
            unit_price: amountMinor / 100,
            currency_id: 'ARS',
          }],
          external_reference: 'pharm:' + dispatchId,
          notification_url: 'https://empresa.autamedica.com/api/ops/mercadopago/argentina-webhook',
          back_urls: {
            success: 'https://paciente.autamedica.com/farmacia/pago/retorno',
            pending: 'https://paciente.autamedica.com/farmacia/pago/retorno',
            failure: 'https://paciente.autamedica.com/farmacia/pago/retorno',
          },
          auto_return: 'approved',
          metadata: {
            payment_type: 'pharmacy_consultation',
            dispatch_id: dispatchId,
            country_code: 'AR',
          },
        }),
      })
      if (!response.ok) return serviceUnavailable('argentina_mercadopago_checkout_unavailable')
      const preference = await response.json() as { id?: string; init_point?: string }
      if (!preference.id || !preference.init_point?.startsWith('https://')) {
        return serviceUnavailable('argentina_mercadopago_preference_invalid')
      }
      return jsonOk({ id: preference.id, init_point: preference.init_point, currency: 'ARS' })
    }

    if (body.action === 'get_payment') {
      const paymentId = typeof body.paymentId === 'string' ? body.paymentId : ''
      if (!PAYMENT_ID.test(paymentId)) return badRequest('invalid_provider_payment_id')
      const response = await providerFetch('/v1/payments/' + encodeURIComponent(paymentId), token)
      if (response.status === 404) return jsonOk({ found: false })
      if (!response.ok) return serviceUnavailable('argentina_mercadopago_payment_lookup_unavailable')
      const payment = safePayment(await response.json() as MercadoPagoPayment, dispatchId)
      return payment ? jsonOk({ found: true, payment }) : jsonOk({ found: false })
    }

    if (body.action === 'search_payment') {
      const query = new URLSearchParams({
        external_reference: 'pharm:' + dispatchId,
        sort: 'date_created',
        criteria: 'desc',
        limit: '10',
      })
      const response = await providerFetch('/v1/payments/search?' + query.toString(), token)
      if (!response.ok) return serviceUnavailable('argentina_mercadopago_search_unavailable')
      const result = await response.json() as { results?: MercadoPagoPayment[] }
      const matches = (result.results ?? [])
        .map((payment) => safePayment(payment, dispatchId))
        .filter((payment) => payment !== null)
      const selected = matches.find((payment) => payment?.status === 'approved') ?? matches[0]
      return selected ? jsonOk({ found: true, payment: selected }) : jsonOk({ found: false })
    }

    return badRequest('unsupported_argentina_broker_action')
  } catch {
    return internalError('argentina_mercadopago_broker_failed')
  }
}
