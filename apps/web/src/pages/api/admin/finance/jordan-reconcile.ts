import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAuthed, withAuthRole } from '@/lib/api-auth'
import { badRequest, conflict, forbidden, internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import {
  classifyVerifiedPharmacyPayment,
  reconcilePharmacyProviderPayment,
  type LocalPharmacyPayment,
  type VerifiedPharmacyProviderPayment,
} from '@/lib/pharmacy/payments/referral-finance'
import { logger } from '@autamedica/shared'
import { isVerifiedJordanCommissionEligible } from '@/lib/pharmacy/payments/jordan-commission-eligibility'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Admin-only recovery if a Mercado Pago webhook was delayed or lost.
 * Never credit by CPF/DNI/name or by trusting a redirect query parameter.
 * Multiple payments for the same dispatch are an audit incident, not a
 * reason to award multiple referral commissions.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request,['admin','platform_admin'],locals)
  if (!isAuthed(auth)) return auth

  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin) return forbidden('cross_origin_not_allowed')
  const body = await request.json().catch(() => null)
  const dispatchId = body?.requestId
  if (typeof dispatchId !== 'string' || !UUID.test(dispatchId)) return badRequest('invalid_request_id')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: dispatch, error: dispatchError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id,referral_partner_id,care_country')
      .eq('id', dispatchId).maybeSingle()
    if (dispatchError) throw dispatchError
    if (dispatch?.care_country !== 'BR' || !dispatch?.referral_partner_id) {
      return badRequest('jordan_br_dispatch_required')
    }
    const { data: partner, error: partnerError } = await admin
      .from('commercial_referral_partners').select('code')
      .eq('id',dispatch.referral_partner_id).maybeSingle()
    if (partnerError) throw partnerError
    if (partner?.code !== 'JORDAN') return badRequest('jordan_br_dispatch_required')

    const { data: local, error: localError } = await admin.from('pharmacy_dispatch_payments')
      .select('id,dispatch_request_id,provider_payment_id,provider_preference_id,amount_minor,currency,status,provider')
      .eq('dispatch_request_id',dispatchId).maybeSingle()
    if (localError) throw localError
    if (!local?.provider_preference_id) return conflict('no_checkout_preference_to_reconcile')

    const secret = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
      ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
    if (!secret) return internalError('payment_provider_not_configured')

    const search = new URL('https://api.mercadopago.com/v1/payments/search')
    search.searchParams.set('external_reference',`pharm:${dispatchId}`)
    search.searchParams.set('sort','date_last_updated')
    search.searchParams.set('criteria','desc')
    search.searchParams.set('limit','10')
    const response = await fetch(search.toString(),{
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      logger.warn('[jordan-reconcile] Provider search unavailable',{ status:response.status })
      return internalError('payment_provider_unavailable')
    }
    const result = await response.json() as { results?: VerifiedPharmacyProviderPayment[] }
    // Detect ALL matching provider charges before enforcing the local payment ID.
    // A second charge must trigger manual review, never be silently ignored.
    const withoutPinnedPaymentId: LocalPharmacyPayment = {
      ...(local as LocalPharmacyPayment), provider_payment_id: null,
    }
    const candidates = (result.results ?? []).filter(p =>
      classifyVerifiedPharmacyPayment(withoutPinnedPaymentId,p) !== null,
    )
    if (candidates.length > 1) {
      return conflict('multiple_matching_payments_manual_review_required')
    }
    if (candidates.length === 0) {
      return jsonOk({ providerMatchedPayments:0,eligibleCommissionCreated:false,
        reason:'no_provider_verified_payment',paidOut:false })
    }
    const evidence = candidates[0]
    if (!evidence) return conflict('missing_provider_payment')
    const reconciled = await reconcilePharmacyProviderPayment(admin,evidence)
    if (!reconciled.handled) return conflict(reconciled.reason ?? 'provider_match_failed')

    // Provider approval alone cannot create a payable Jordan commission.
    // Only the DB ledger is authoritative after trusted identity verification.
    const [
      { data: payment, error: paymentError },
      { data: commission, error: commissionError },
    ] = await Promise.all([
      admin.from('pharmacy_dispatch_payments')
        .select('status').eq('dispatch_request_id',dispatchId).maybeSingle(),
      admin.from('commercial_referral_commissions')
        .select('status,verified_subject_hash')
        .eq('dispatch_request_id',dispatchId)
        .eq('referral_partner_id',dispatch.referral_partner_id)
        .maybeSingle(),
    ])
    if (paymentError || commissionError) throw paymentError ?? commissionError
    const eligibleCommissionCreated = isVerifiedJordanCommissionEligible(
      payment?.status, commission,
    )
    return jsonOk({
      providerMatchedPayments:1,
      verifiedStatus:payment?.status ?? 'unknown',
      eligibleCommissionCreated,
      requiresTrustedIdentityVerification: !eligibleCommissionCreated,
      paidOut:false,
      providerConfirmedIsNotBankSettled:true,
    })
  } catch (error) {
    logger.error('[jordan-reconcile] Failed to reconcile', {
      reason:error instanceof Error?error.message:'unknown',
    })
    return internalError('jordan_reconciliation_failed')
  }
}
