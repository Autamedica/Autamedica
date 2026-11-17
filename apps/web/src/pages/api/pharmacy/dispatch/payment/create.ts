import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { badRequest, internalError, jsonOk, serviceUnavailable, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { authorizePharmacyPaymentRequest, hasSecureGuestPaymentSecret } from '@/lib/pharmacy/payments/guest-payment-access'
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
    if (!['BR', 'AR'].includes(dispatch?.care_country ?? '') || dispatch?.tier_requested !== 'general') {
      return badRequest('pharmacy_payment_available_for_ar_br_general_only')
    }
    if (!['pending_payment','searching','matched','in_call'].includes(dispatch.status)) {
      return badRequest('pharmacy_payment_request_not_payable')
    }

    // Amount and currency are sourced from the active country tariff.
    // Jordan is an attribution overlay, not a different payment requirement.
    const { data: source, error: sourceError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('referral_partner_id, commercial_referral_partners!pharmacy_dispatch_requests_referral_partner_id_fkey(code,active)')
      .eq('id', dispatch.id).maybeSingle()
    if (sourceError) throw sourceError
    const partner = source?.commercial_referral_partners as { code?: string; active?: boolean } | null
    const isJordan = partner?.code === 'JORDAN'
    if (source?.referral_partner_id && partner?.active !== true) {
      return badRequest('unsupported_or_inactive_pharmacy_referral')
    }

    const { data: pricing, error: pricingError } = await (admin as any)
      .from('pharmacy_dispatch_pricing_configs')
      .select('country_code,currency,consultation_price_minor,doctor_fee_minor,partner_commission_minor,require_payment_before_dispatch')
      .eq('country_code', dispatch.care_country)
      .maybeSingle()
    if (pricingError || !pricing) return serviceUnavailable('pharmacy_dispatch_pricing_not_configured')
    const { data: quote, error: quoteError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('doctor_fee_minor,price_minor,currency')
      .eq('id', dispatch.id)
      .maybeSingle()
    if (quoteError) throw quoteError
    if (Number(quote?.doctor_fee_minor) !== pricing.doctor_fee_minor ||
        Number(quote?.price_minor) !== pricing.consultation_price_minor || quote?.currency !== pricing.currency) {
      return serviceUnavailable('pharmacy_country_quote_not_verified')
    }
    const amountCents = pricing.consultation_price_minor
    const currency = pricing.currency as 'BRL' | 'ARS'
    const argentinaProviderToken = dispatch.care_country === 'AR'
      ? (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN_AR as string | undefined)
        ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN_AR')
      : undefined
    // Never send ARS through a Brazilian merchant token. Without a dedicated
    // Argentina PSP credential, leave an auditable manual-pilot payment row.
    const manualPilot = dispatch.care_country === 'AR' && !argentinaProviderToken
    const { data: old, error: oldError } = await admin.from('pharmacy_dispatch_payments')
      .select('id,status,checkout_url,amount_minor,currency,provider,provider_preference_id,provider_payment_id,metadata')
      .eq('dispatch_request_id',dispatch.id).maybeSingle()
    if (oldError) throw oldError
    if (old) {
      if (old.amount_minor !== amountCents || old.currency !== currency) throw new Error('checkout_amount_changed')
      if (old.status === 'approved') return jsonOk({ status: 'approved', checkoutUrl: null, amountCents, currency })
      if (old.status === 'pending' && old.checkout_url) {
        return jsonOk({ status: 'pending', checkoutUrl: old.checkout_url, amountCents, currency })
      }
      if (manualPilot && old.status === 'pending' && old.metadata?.payment_mode === 'manual_pilot'
          && old.metadata?.manual_approval_pending === true) {
        return jsonOk({ status: 'pending', checkoutUrl: null, amountCents, currency, manualApprovalRequired: true })
      }
      if (manualPilot && old.status === 'failed' && !old.provider_preference_id && !old.provider_payment_id) {
        const { data: recovered, error: recoverError } = await admin.from('pharmacy_dispatch_payments')
          .update({ status: 'pending', checkout_url: null, metadata: { ...(old.metadata ?? {}), payment_mode: 'manual_pilot', manual_approval_pending: true, country_code: 'AR' } })
          .eq('id', old.id).eq('status', 'failed').select('id').maybeSingle()
        if (recoverError || !recovered) throw recoverError ?? new Error('manual_pilot_payment_recovery_failed')
        return jsonOk({ status: 'pending', checkoutUrl: null, amountCents, currency, manualApprovalRequired: true })
      }
      // A provider request may have succeeded even if the response was lost.
      // Do not create a second preference for the same dispatch automatically.
      return serviceUnavailable('checkout_requires_manual_reconciliation')
    } else {
      // Operational switches stop new checkouts only. Existing pending/approved payments
      // above remain readable and usable after an Admin pause.
      const operationalSwitches = await getOperationalPaymentSwitches(admin).catch(() => null)
      if (!operationalSwitches?.pharmacy_express_payments_enabled || (!manualPilot && !operationalSwitches.global_pix_mp_payments_enabled) || (isJordan && !operationalSwitches.jordan_qr_payments_enabled)) {
        return serviceUnavailable('pharmacy_checkout_not_enabled')
      }
      // Clinical provider health is intentionally not a checkout dependency.
      // A Memed/Farmalink incident may leave a document pending without disabling payments.
      const countryScope = dispatch.care_country
      const requiredScopes = [countryScope, 'EXPRESS', ...(isJordan ? ['JORDAN'] : [])]
      const scopes = await admin.from('platform_operational_domains')
        .select('scope_key,commercial_status,financial_status')
        .in('scope_key', requiredScopes)
      if (scopes.error) return serviceUnavailable('commercial_governance_unavailable')
      const scopeByKey = new Map((scopes.data ?? []).map((row: any) => [row.scope_key,row]))
      const channelOpen = requiredScopes.every((key) => {
        const row: any = scopeByKey.get(key)
        return row && ['enabled','limited'].includes(row.commercial_status)
      })
      const financialOpen = requiredScopes.every((key) => {
        const row: any = scopeByKey.get(key)
        return row && row.financial_status !== 'unavailable'
      })
      if (!channelOpen) return serviceUnavailable('pharmacy_commercial_channel_paused')
      if (!financialOpen) return serviceUnavailable('pharmacy_financial_rail_unavailable')
      const { data: created, error: createError } = await admin.from('pharmacy_dispatch_payments')
        .insert({
          dispatch_request_id: dispatch.id,
          amount_minor: amountCents,
          currency,
          status: manualPilot ? 'pending' : 'initializing',
          provider: manualPilot ? 'manual' : 'mercadopago',
          ...(manualPilot ? { metadata: { payment_mode: 'manual_pilot', manual_approval_pending: true, country_code: 'AR' } } : {}),
        })
        .select('id').single()
      if (createError?.code === '23505') return serviceUnavailable('checkout_already_initializing')
      if (createError || !created) throw createError ?? new Error('payment_row_creation_failed')
      initializedPaymentId = created.id
      if (manualPilot) {
        return jsonOk({ status: 'pending', checkoutUrl: null, amountCents, currency, manualApprovalRequired: true })
      }
    }

    const secret = dispatch.care_country === 'AR'
      ? argentinaProviderToken
      : (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
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
          currency_id: currency,
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
    return jsonOk({ status: 'pending', checkoutUrl: checkout.init_point, amountCents, currency })
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
