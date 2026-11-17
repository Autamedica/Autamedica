import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { verifyMercadoPagoBrokerRequest } from '@/lib/payments/mercadopago-broker-signature'
import {
  reconcilePharmacyProviderPayment,
  type VerifiedPharmacyProviderPayment,
} from '@/lib/pharmacy/payments/referral-finance'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request, locals }) => {
  const rawBody = await request.text()
  if (!await verifyMercadoPagoBrokerRequest(request, rawBody, locals.runtime?.env)) {
    return unauthorized('mercadopago_broker_signature_invalid')
  }

  let body: { payment?: VerifiedPharmacyProviderPayment }
  try {
    body = JSON.parse(rawBody) as typeof body
  } catch {
    return badRequest('invalid_json')
  }

  const payment = body.payment
  const dispatchId = typeof payment?.metadata?.dispatch_id === 'string' ? payment.metadata.dispatch_id : ''
  const referenceMatch = /^pharm:([0-9a-f-]{36})$/i.exec(payment?.external_reference ?? '')
  if (
    !payment ||
    !/^\d{1,20}$/.test(String(payment.id)) ||
    payment.currency_id !== 'ARS' ||
    payment.metadata?.payment_type !== 'pharmacy_consultation' ||
    !dispatchId ||
    referenceMatch?.[1] !== dispatchId
  ) return badRequest('argentina_pharmacy_payment_evidence_invalid')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = await reconcilePharmacyProviderPayment(admin, payment)
    // An authenticated MLA webhook whose payment does not map to a local
    // dispatch is acknowledged once; transient DB failures still throw/retry.
    return jsonOk({ received: true, handled: result.handled, ...(result.reason ? { reason: result.reason } : {}) })
  } catch {
    return internalError('argentina_pharmacy_payment_reconciliation_failed')
  }
}
