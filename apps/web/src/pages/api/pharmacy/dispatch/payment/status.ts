import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { authorizePharmacyPaymentRequest } from '@/lib/pharmacy/payments/guest-payment-access'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { createMercadoPagoBrokerHeaders } from '@/lib/payments/mercadopago-broker-signature'
import {
  classifyVerifiedPharmacyPayment,
  reconcilePharmacyProviderPayment,
  type LocalPharmacyPayment,
  type VerifiedPharmacyProviderPayment,
} from '@/lib/pharmacy/payments/referral-finance'
import { logger } from '@autamedica/shared'

/**
 * Patient-facing read is protected by the original scoped guest token and
 * returns ONLY commercial payment status, never PII or clinical information.
 * Provider lookup also repairs webhook delivery delays and detects refunds.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null)
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const dispatch = await authorizePharmacyPaymentRequest(
      admin, body?.requestId, body?.accessToken, locals.runtime?.env,
    )
    if (!dispatch) return unauthorized('pharmacy_request_token_required')

    const fetchPayment = async () => admin.from('pharmacy_dispatch_payments')
      .select('id,provider,provider_payment_id,provider_preference_id,status,amount_minor,currency,metadata')
      .eq('dispatch_request_id',dispatch.id)
      .maybeSingle()

    const { data: local, error } = await fetchPayment()
    if (error) throw error
    if (!local) return jsonOk({ status: 'not_started' })

    const isManualOverride = String(local.provider_payment_id ?? '').startsWith('MANUAL_OVERRIDE_')
    if (local.provider === 'mercadopago' && !isManualOverride) {
      if (dispatch.care_country === 'AR') {
        // Resolve ARS exclusively through the MLA broker hosted by the company portal.
        const brokerPath = '/api/ops/mercadopago/argentina-broker'
        const brokerBody = JSON.stringify({
          action: local.provider_payment_id ? 'get_payment' : 'search_payment',
          dispatchId: dispatch.id,
          ...(local.provider_payment_id ? { paymentId: local.provider_payment_id } : {}),
        })
        const brokerHeaders = await createMercadoPagoBrokerHeaders(
          'POST', brokerPath, brokerBody, locals.runtime?.env,
        )
        const brokerResponse = await fetch('https://empresa.autamedica.com' + brokerPath, {
          method: 'POST',
          headers: brokerHeaders,
          body: brokerBody,
          signal: AbortSignal.timeout(12000),
        })
        if (brokerResponse.ok) {
          const brokerResult = await brokerResponse.json() as {
            success?: boolean
            data?: { found?: boolean; payment?: VerifiedPharmacyProviderPayment }
          }
          if (brokerResult.data?.found && brokerResult.data.payment) {
            const result = await reconcilePharmacyProviderPayment(admin, brokerResult.data.payment)
            if (!result.handled) logger.warn('[pharmacy-payment/status] AR PSP evidence rejected', { reason: result.reason })
          }
        } else {
          logger.warn('[pharmacy-payment/status] AR broker unavailable', { httpStatus: brokerResponse.status })
        }
      } else if (dispatch.care_country === 'BR') {
        const accessToken = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
          ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
        if (accessToken) {
          let providerPayments: VerifiedPharmacyProviderPayment[] = []
          if (local.provider_payment_id) {
            const response = await fetch(
              'https://api.mercadopago.com/v1/payments/' + encodeURIComponent(local.provider_payment_id),
              {
                headers: { Authorization: 'Bearer ' + accessToken },
                signal: AbortSignal.timeout(10000),
              },
            )
            if (response.ok) {
              providerPayments = [await response.json() as VerifiedPharmacyProviderPayment]
            } else {
              logger.warn('[pharmacy-payment/status] BR provider unavailable', { httpStatus: response.status })
            }
          } else {
            // Recover a delayed/lost webhook by the exact external reference used
            // by checkout. Candidate classification verifies amount, currency,
            // metadata and dispatch identity before changing local payment state.
            const search = new URL('https://api.mercadopago.com/v1/payments/search')
            search.searchParams.set('external_reference', 'pharm:' + dispatch.id)
            search.searchParams.set('sort', 'date_last_updated')
            search.searchParams.set('criteria', 'desc')
            search.searchParams.set('limit', '10')
            const response = await fetch(search.toString(), {
              headers: { Authorization: 'Bearer ' + accessToken },
              signal: AbortSignal.timeout(12000),
            })
            if (response.ok) {
              const result = await response.json() as { results?: VerifiedPharmacyProviderPayment[] }
              const localEvidence: LocalPharmacyPayment = {
                id: local.id,
                dispatch_request_id: dispatch.id,
                provider_payment_id: null,
                amount_minor: local.amount_minor,
                currency: local.currency,
                status: local.status,
                provider: local.provider,
              }
              providerPayments = (result.results ?? []).filter(payment =>
                classifyVerifiedPharmacyPayment(localEvidence, payment) !== null,
              )
              if (providerPayments.length > 1) {
                logger.warn('[pharmacy-payment/status] BR multiple provider payments match dispatch; reconciliation withheld', {
                  dispatchId: dispatch.id,
                  candidateCount: providerPayments.length,
                })
                providerPayments = []
              }
            } else {
              logger.warn('[pharmacy-payment/status] BR provider search unavailable', { httpStatus: response.status })
            }
          }
          if (providerPayments.length === 1) {
            const result = await reconcilePharmacyProviderPayment(admin, providerPayments[0])
            if (!result.handled) logger.warn('[pharmacy-payment/status] BR PSP evidence rejected', { reason: result.reason })
          }
        }
      }
    }
    const { data: latest, error: latestError } = await fetchPayment()
    if (latestError) throw latestError
    return jsonOk({
      status: latest?.status ?? 'not_started',
      amountCents: latest?.amount_minor ?? null,
      currency: latest?.currency ?? null,
      // Legacy rows created by the old manual fallback are recovered by the
      // next Pagar action; never block the real Mercado Pago checkout behind review.
      manualApprovalRequired: false,
    })
  } catch (error) {
    logger.error('[pharmacy-payment/status] Error checking payment', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return internalError('pharmacy_payment_status_unavailable')
  }
}
