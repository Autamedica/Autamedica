import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { authorizePharmacyPaymentRequest } from '@/lib/pharmacy/payments/guest-payment-access'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import {
  reconcilePharmacyProviderPayment, type VerifiedPharmacyProviderPayment,
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

    const fetchPayment = async () => admin!.from('pharmacy_dispatch_payments')
      .select('id,provider_payment_id,status,amount_minor,currency')
      .eq('dispatch_request_id',dispatch.id)
      .maybeSingle()

    const { data: local, error } = await fetchPayment()
    if (error) throw error
    if (!local) return jsonOk({ status: 'not_started' })

    const accessToken = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
      ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
    if (local.provider_payment_id && accessToken) {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(local.provider_payment_id)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10000),
        },
      )
      if (response.ok) {
        const provider = (await response.json()) as VerifiedPharmacyProviderPayment
        const result = await reconcilePharmacyProviderPayment(admin, provider)
        if (!result.handled) {
          logger.warn('[pharmacy-payment/status] PSP evidence rejected', { reason: result.reason })
        }
      } else {
        logger.warn('[pharmacy-payment/status] Provider unavailable', { httpStatus: response.status })
      }
    }
    const { data: latest, error: latestError } = await fetchPayment()
    if (latestError) throw latestError
    return jsonOk({
      status: latest?.status ?? 'not_started',
      amountCents: latest?.amount_minor ?? null,
      currency: latest?.currency ?? null,
    })
  } catch (error) {
    logger.error('[pharmacy-payment/status] Error checking payment', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return internalError('pharmacy_payment_status_unavailable')
  }
}
