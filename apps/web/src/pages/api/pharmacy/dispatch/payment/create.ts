import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { badRequest, internalError, jsonOk, serviceUnavailable, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { createMercadoPagoBrokerHeaders } from '@/lib/payments/mercadopago-broker-signature'
import { authorizePharmacyPaymentRequest, hasSecureGuestPaymentSecret } from '@/lib/pharmacy/payments/guest-payment-access'
import { logger } from '@autamedica/shared'
import { captureSentryException } from '@/lib/observability/sentry'
import { getOperationalPaymentSwitches } from '@/lib/payments/operational-switches'

interface CheckoutPreference {
  id: string
  init_point: string
}

const API = 'https://api.mercadopago.com'

async function readArgentinaBrokerErrorCode(response: Response): Promise<string | null> {
  const payload = await response.clone().json().catch(() => null) as {
    error?: { code?: unknown; message?: unknown }
  } | null
  const code = payload?.error?.message ?? payload?.error?.code
  return typeof code === 'string' && /^[a-z0-9_]{2,80}$/i.test(code) ? code : null
}

export const POST: APIRoute = async ({ request, locals }) => {
  let initializedPaymentId: string | null = null
  let admin: SupabaseClient | null = null
  let failureStage = 'initialize'
  let failureCountry: 'AR' | 'BR' | 'unknown' = 'unknown'
  let brokerHttpStatus: number | null = null
  let brokerErrorCode: string | null = null
  try {
    admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    if (!hasSecureGuestPaymentSecret(locals.runtime?.env)) return serviceUnavailable('pharmacy_checkout_guest_security_not_configured')

    const body = await request.json().catch(() => null)
    const requestId = body?.requestId
    const token = body?.accessToken

    failureStage = 'authorize_dispatch'
    const dispatch = await authorizePharmacyPaymentRequest(admin, requestId, token, locals.runtime?.env)
    if (!dispatch) return unauthorized('pharmacy_request_token_required')
    failureCountry = dispatch.care_country === 'AR' || dispatch.care_country === 'BR' ? dispatch.care_country : 'unknown'
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
      .select('referral_partner_id,referral_source_code,commercial_referral_partners!pharmacy_dispatch_requests_referral_partner_id_fkey(code,active)')
      .eq('id', dispatch.id).maybeSingle()
    if (sourceError) throw sourceError
    const partner = source?.commercial_referral_partners as { code?: string; active?: boolean } | null
    const isJordan = partner?.code === 'JORDAN'
    const qrSourceCode = typeof source?.referral_source_code === 'string' ? source.referral_source_code : null
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
    // Brazil uses the MLB token in this patient portal. Argentina's MLA
    // token lives in the company Pages environment and is never read here.
    const providerToken = dispatch.care_country === 'BR'
      ? (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
        ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
      : undefined
    const { data: old, error: oldError } = await admin.from('pharmacy_dispatch_payments')
      .select('id,status,checkout_url,amount_minor,currency,provider,provider_preference_id,provider_payment_id,referral_source_code,metadata')
      .eq('dispatch_request_id',dispatch.id).maybeSingle()
    if (oldError) throw oldError
    if (old) {
      if (old.amount_minor !== amountCents || old.currency !== currency) throw new Error('checkout_amount_changed')
      if (qrSourceCode && old.referral_source_code !== qrSourceCode) {
        const previousMetadata = old.metadata && typeof old.metadata === 'object' && !Array.isArray(old.metadata)
          ? old.metadata as Record<string, unknown> : {}
        const { error: attributionError } = await (admin as any).from('pharmacy_dispatch_payments')
          .update({
            referral_source_code: qrSourceCode,
            metadata: {
              ...previousMetadata,
              referral_source_code: qrSourceCode,
              referral_partner_code: partner?.code ?? null,
            },
          })
          .eq('id', old.id)
        if (attributionError) throw attributionError
      }
      if (old.status === 'approved') return jsonOk({ status: 'approved', checkoutUrl: null, amountCents, currency })
      if (old.status === 'pending' && old.checkout_url) {
        return jsonOk({ status: 'pending', checkoutUrl: old.checkout_url, amountCents, currency })
      }
      const recoverableManualPlaceholder = (old.status === 'pending' || old.status === 'failed')
        && old.metadata?.payment_mode === 'manual_pilot'
        && old.metadata?.manual_approval_pending === true
        && !old.provider_preference_id && !old.provider_payment_id && !old.checkout_url
      if (recoverableManualPlaceholder) {
        if (currency === 'BRL' && !providerToken) return serviceUnavailable('mercadopago_access_not_configured')
        // These rows were created by the old AR fallback without contacting Mercado Pago.
        // Upgrade the same row atomically and create the first real provider preference.
        const { data: recovered, error: recoverError } = await admin.from('pharmacy_dispatch_payments')
          .update({
            status: 'initializing',
            provider: 'mercadopago',
            checkout_url: null,
            referral_source_code: qrSourceCode,
            metadata: {
              ...(old.metadata ?? {}),
              payment_mode: 'mercadopago',
              manual_approval_pending: false,
              referral_source_code: qrSourceCode,
              referral_partner_code: partner?.code ?? null,
              recovered_from_manual_placeholder_at: new Date().toISOString(),
            },
          })
          .eq('id', old.id).eq('status', old.status).select('id').maybeSingle()
        if (recoverError) throw recoverError
        if (!recovered) return serviceUnavailable('checkout_already_initializing')
        initializedPaymentId = old.id
      } else if (old.status === 'failed' && currency === 'ARS' &&
          !old.provider_preference_id && !old.provider_payment_id && !old.checkout_url) {
        // A failed AR checkout with no stored preference/payment cannot be shown to the patient.
        // Reconcile the provider's payment ledger before retrying; this prevents a second
        // preference when an earlier payment actually exists while unblocking transient failures.
        failureStage = 'argentina_reconcile_signature'
        const brokerPath = '/api/ops/mercadopago/argentina-broker'
        const reconcileBody = JSON.stringify({ action: 'search_payment', dispatchId: dispatch.id })
        const reconcileHeaders = await createMercadoPagoBrokerHeaders(
          'POST', brokerPath, reconcileBody, locals.runtime?.env,
        )
        failureStage = 'argentina_reconcile_http'
        const reconcileResponse = await fetch('https://empresa.autamedica.com' + brokerPath, {
          method: 'POST', headers: reconcileHeaders, body: reconcileBody,
          signal: AbortSignal.timeout(18000),
        })
        if (!reconcileResponse.ok) {
          brokerHttpStatus = reconcileResponse.status
          brokerErrorCode = await readArgentinaBrokerErrorCode(reconcileResponse)
          throw new Error('argentina_checkout_reconciliation_unavailable')
        }
        failureStage = 'argentina_reconcile_response'
        const reconcileResult = await reconcileResponse.json() as {
          success?: boolean
          data?: { found?: boolean; payment?: { status?: string } }
        }
        if (reconcileResult.success !== true || typeof reconcileResult.data?.found !== 'boolean') {
          throw new Error('argentina_checkout_reconciliation_response_invalid')
        }
        const providerPaymentStatus = reconcileResult.data.payment?.status ?? ''
        if (reconcileResult.data.found && !['rejected', 'cancelled'].includes(providerPaymentStatus)) {
          return serviceUnavailable('checkout_requires_manual_reconciliation')
        }
        const { data: recovered, error: recoverError } = await admin.from('pharmacy_dispatch_payments')
          .update({
            status: 'initializing',
            referral_source_code: qrSourceCode,
            metadata: {
              ...(old.metadata ?? {}),
              payment_mode: 'mercadopago',
              manual_approval_pending: false,
              referral_source_code: qrSourceCode,
              referral_partner_code: partner?.code ?? null,
              recovered_failed_checkout_at: new Date().toISOString(),
              provider_reconciliation: reconcileResult.data.found ? providerPaymentStatus : 'no_payment_found',
            },
          })
          .eq('id', old.id).eq('status', 'failed')
          .is('provider_preference_id', null).is('provider_payment_id', null).is('checkout_url', null)
          .select('id').maybeSingle()
        if (recoverError) throw recoverError
        if (!recovered) return serviceUnavailable('checkout_already_initializing')
        initializedPaymentId = old.id
      } else {
        // A provider request may have succeeded even if the response was lost.
        // Keep unresolved rows blocked unless the provider ledger proves a safe retry.
        return serviceUnavailable(old.status === 'initializing'
          ? 'checkout_already_initializing'
          : 'checkout_requires_manual_reconciliation')
      }
    } else {
      if (currency === 'BRL' && !providerToken) return serviceUnavailable('mercadopago_access_not_configured')
      // Operational switches stop new checkouts only. Existing pending/approved payments
      // above remain readable and usable after an Admin pause.
      const operationalSwitches = await getOperationalPaymentSwitches(admin).catch(() => null)
      if (!operationalSwitches?.pharmacy_express_payments_enabled || !operationalSwitches.global_pix_mp_payments_enabled || (isJordan && !operationalSwitches.jordan_qr_payments_enabled)) {
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
          referral_source_code: qrSourceCode,
          metadata: {
            payment_type: 'pharmacy_consultation',
            dispatch_id: dispatch.id,
            referral_source_code: qrSourceCode,
            referral_partner_code: partner?.code ?? null,
          },
          status: 'initializing',
          provider: 'mercadopago',
        })
        .select('id').single()
      if (createError?.code === '23505') return serviceUnavailable('checkout_already_initializing')
      if (createError || !created) throw createError ?? new Error('payment_row_creation_failed')
      initializedPaymentId = created.id
    }
    let checkout: CheckoutPreference
    if (dispatch.care_country === 'AR') {
      failureStage = 'argentina_broker_signature'
      // ARS is always created by the MLA account hosted in empresa.autamedica.com.
      // The patient portal never reads or forwards its local MLB token for AR.
      const brokerPath = '/api/ops/mercadopago/argentina-broker'
      const brokerBody = JSON.stringify({
        action: 'create_preference',
        dispatchId: dispatch.id,
        amountMinor: amountCents,
      })
      const brokerHeaders = await createMercadoPagoBrokerHeaders(
        'POST', brokerPath, brokerBody, locals.runtime?.env,
      )
      failureStage = 'argentina_broker_http'
      const brokerResponse = await fetch('https://empresa.autamedica.com' + brokerPath, {
        method: 'POST',
        headers: brokerHeaders,
        body: brokerBody,
        signal: AbortSignal.timeout(18000),
      })
      if (!brokerResponse.ok) {
        brokerHttpStatus = brokerResponse.status
        brokerErrorCode = await readArgentinaBrokerErrorCode(brokerResponse)
        logger.warn('[pharmacy-payment/create] Argentina broker unavailable', {
          httpStatus: brokerHttpStatus, brokerErrorCode: brokerErrorCode ?? 'unknown',
        })
        throw new Error('argentina_checkout_broker_unavailable')
      }
      failureStage = 'argentina_broker_response'
      const brokerResult = await brokerResponse.json() as {
        success?: boolean
        data?: { id?: string; init_point?: string }
      }
      checkout = {
        id: brokerResult.data?.id ?? '',
        init_point: brokerResult.data?.init_point ?? '',
      }
    } else {
      failureStage = 'brazil_mercadopago_preference'
      const appUrl = 'https://paciente.autamedica.com'
      const response = await fetch(API + '/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + providerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{
            title: 'AutaMedica - Consulta médica',
            quantity: 1,
            unit_price: amountCents / 100,
            currency_id: 'BRL',
          }],
          external_reference: 'pharm:' + dispatch.id,
          notification_url: appUrl + '/api/payments/mercadopago/webhook',
          back_urls: {
            success: appUrl + '/farmacia/pago/retorno',
            pending: appUrl + '/farmacia/pago/retorno',
            failure: appUrl + '/farmacia/pago/retorno',
          },
          auto_return: 'approved',
          metadata: {
            payment_type: 'pharmacy_consultation',
            dispatch_id: dispatch.id,
            referral_source_code: qrSourceCode,
            referral_partner_code: partner?.code ?? null,
          },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        logger.warn('[pharmacy-payment/create] Brazil provider checkout unavailable', { httpStatus: response.status })
        throw new Error('checkout_provider_unavailable')
      }
      checkout = await response.json() as CheckoutPreference
    }
    failureStage = 'validate_provider_preference'
    if (!checkout.id || !checkout.init_point?.startsWith('https://')) {
      throw new Error('provider_checkout_response_invalid')
    }
    failureStage = 'persist_provider_preference'
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
    const reason = error instanceof Error ? error.message : 'unknown'
    logger.error('[pharmacy-payment/create] Could not create checkout', {
      reason, failureStage, country: failureCountry, paymentIdPresent: Boolean(initializedPaymentId),
      brokerHttpStatus: brokerHttpStatus ?? undefined, brokerErrorCode: brokerErrorCode ?? undefined,
    })
    captureSentryException(error, {
      surface: 'pharmacy_payment_checkout',
      layer: 'server',
      owner: 'pharmacy_dispatch_payment_create',
      runtimeEnv: locals.runtime?.env,
      tags: {
        country: failureCountry, failure_stage: failureStage, operation: 'create_preference',
        broker_http_status: brokerHttpStatus ? String(brokerHttpStatus) : 'none',
        broker_error_code: brokerErrorCode ?? 'none',
      },
      context: { reason, paymentIdPresent: Boolean(initializedPaymentId), brokerHttpStatus, brokerErrorCode },
      fingerprint: ['pharmacy-payment-checkout', failureCountry, failureStage],
    })
    if (admin && initializedPaymentId) {
      const { data: failedPayment } = await admin.from('pharmacy_dispatch_payments')
        .select('metadata').eq('id', initializedPaymentId).maybeSingle()
      const existingMetadata = failedPayment?.metadata && typeof failedPayment.metadata === 'object'
        ? failedPayment.metadata as Record<string, unknown> : {}
      await admin.from('pharmacy_dispatch_payments')
        .update({
          status: 'failed',
          metadata: {
            ...existingMetadata,
            last_checkout_failure: {
              stage: failureStage, reason, broker_http_status: brokerHttpStatus,
              broker_error_code: brokerErrorCode, failed_at: new Date().toISOString(),
            },
          },
        })
        .eq('id',initializedPaymentId).eq('status','initializing')
    }
    if (failureStage.startsWith('argentina_reconcile_')) {
      return serviceUnavailable('argentina_checkout_reconciliation_unavailable')
    }
    return internalError('pharmacy_checkout_unavailable')
  }
}
