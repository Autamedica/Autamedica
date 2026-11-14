import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { badRequest, internalError, jsonOk, serviceUnavailable, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { authorizePharmacyPaymentRequest, hasSecureGuestPaymentSecret } from '@/lib/pharmacy/payments/guest-payment-access'
import { GENERAL_PHARMACY_BR_PRICE_CENTS, JORDAN_DOCTOR_FEE_CENTS } from '@/lib/pharmacy/payments/referral-finance'
import { logger } from '@autamedica/shared'
import { getOperationalPaymentSwitches } from '@/lib/payments/operational-switches'

interface CheckoutPreference {
  id: string
  init_point: string
}

const API = 'https://api.mercadopago.com'

export const POST: APIRoute = async ({ request, locals }) => {
  let initializedPaymentId: string | null = null
  let admin: SupabaseClient | null = null
  try {
    admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    if (!hasSecureGuestPaymentSecret(locals.runtime?.env)) return serviceUnavailable('pharmacy_checkout_guest_security_not_configured')

    const body = await request.json().catch(() => null)
    const requestId = body?.requestId
    const token = body?.accessToken

    const dispatch = await authorizePharmacyPaymentRequest(admin, requestId, token, locals.runtime?.env)
    if (!dispatch) return unauthorized('pharmacy_request_token_required')
    if (dispatch.care_country !== 'BR' || dispatch.tier_requested !== 'general') {
      return badRequest('pharmacy_payment_available_for_brazil_general_only')
    }
    if (!['searching','matched','in_call'].includes(dispatch.status)) {
      return badRequest('pharmacy_payment_request_not_payable')
    }

    // Initial rollout deliberately scoped to Jordan's commercial QR.
    const { data: source, error: sourceError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('referral_partner_id, commercial_referral_partners!pharmacy_dispatch_requests_referral_partner_id_fkey(code,active)')
      .eq('id', dispatch.id).maybeSingle()
    if (sourceError) throw sourceError
    const partner = source?.commercial_referral_partners as { code?: string; active?: boolean } | null
    if (partner?.code !== 'JORDAN' || partner.active !== true) {
      return badRequest('jordan_qr_required_for_this_checkout')
    }

    // Charge before dispatch. The server-owned request quote is fixed by the
    // Jordan partner policy; no doctor assignment or accepted offer is required.
    const { data: quote, error: quoteError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('doctor_fee_brl,price_brl')
      .eq('id', dispatch.id)
      .maybeSingle()
    if (quoteError) throw quoteError
    if (Number(quote?.doctor_fee_brl) !== JORDAN_DOCTOR_FEE_CENTS / 100 ||
        Number(quote?.price_brl) !== GENERAL_PHARMACY_BR_PRICE_CENTS / 100) {
      return serviceUnavailable('jordan_medical_quote_not_verified')
    }
    const amountCents = GENERAL_PHARMACY_BR_PRICE_CENTS
    const { data: old, error: oldError } = await admin.from('pharmacy_dispatch_payments')
      .select('id,status,checkout_url,amount_minor,currency').eq('dispatch_request_id',dispatch.id).maybeSingle()
    if (oldError) throw oldError
    if (old) {
      if (old.amount_minor !== amountCents || old.currency !== 'BRL') throw new Error('checkout_amount_changed')
      if (old.status === 'approved') return jsonOk({ status: 'approved', checkoutUrl: null })
      if (old.status === 'pending' && old.checkout_url) {
        return jsonOk({ status: 'pending', checkoutUrl: old.checkout_url })
      }
      // A provider request may have succeeded even if the response was lost.
      // Do not create a second preference for the same dispatch automatically.
      return serviceUnavailable('checkout_requires_manual_reconciliation')
    } else {
      // Operational switches stop new checkouts only. Existing pending/approved payments
      // above remain readable and usable after an Admin pause.
      const operationalSwitches = await getOperationalPaymentSwitches(admin).catch(() => null)
      if (!operationalSwitches?.jordan_qr_payments_enabled || !operationalSwitches.pharmacy_express_payments_enabled || !operationalSwitches.global_pix_mp_payments_enabled) {
        return serviceUnavailable('pharmacy_checkout_not_enabled')
      }
      const { data: created, error: createError } = await admin.from('pharmacy_dispatch_payments')
        .insert({
          dispatch_request_id: dispatch.id,
          amount_minor: amountCents,
          currency: 'BRL',
          status: 'initializing',
          provider: 'mercadopago',
        })
        .select('id').single()
      if (createError?.code === '23505') return serviceUnavailable('checkout_already_initializing')
      if (createError || !created) throw createError ?? new Error('payment_row_creation_failed')
      initializedPaymentId = created.id
    }

    const secret = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
      ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
    if (!secret) throw new Error('mercadopago_access_not_configured')
    const appUrl = ((locals.runtime?.env?.PUBLIC_APP_URL as string | undefined)
      ?? getRuntimeEnvValue('PUBLIC_APP_URL')
      ?? 'https://www.autamedica.com').replace(/\/+$/, '')

    const response = await fetch(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{
          title: 'AutaMedica - Consulta médica',
          quantity: 1,
          unit_price: amountCents / 100,
          currency_id: 'BRL',
        }],
        external_reference: `pharm:${dispatch.id}`,
        notification_url: `${appUrl}/api/payments/mercadopago/webhook`,
        back_urls: {
          success: `${appUrl}/farmacia/pago/retorno`,
          pending: `${appUrl}/farmacia/pago/retorno`,
          failure: `${appUrl}/farmacia/pago/retorno`,
        },
        metadata: {
          payment_type: 'pharmacy_consultation',
          dispatch_id: dispatch.id,
        },
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      logger.warn('[pharmacy-payment/create] Provider checkout unavailable', { httpStatus: response.status })
      throw new Error('checkout_provider_unavailable')
    }
    const checkout = (await response.json()) as CheckoutPreference
    if (!checkout.id || !checkout.init_point?.startsWith('https://')) {
      throw new Error('provider_checkout_response_invalid')
    }
    const { data: saved, error: saveError } = await admin.from('pharmacy_dispatch_payments')
      .update({
        status: 'pending',
        provider_preference_id: checkout.id,
        checkout_url: checkout.init_point,
      })
      .eq('id', initializedPaymentId).eq('status','initializing')
      .select('id').maybeSingle()
    if (saveError || !saved) throw saveError ?? new Error('checkout_save_conflict')
    return jsonOk({ status: 'pending', checkoutUrl: checkout.init_point })
  } catch (error) {
    logger.error('[pharmacy-payment/create] Could not create checkout', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    if (admin && initializedPaymentId) {
      await admin.from('pharmacy_dispatch_payments')
        .update({ status: 'failed' })
        .eq('id',initializedPaymentId).eq('status','initializing')
    }
    return internalError('pharmacy_checkout_unavailable')
  }
}
