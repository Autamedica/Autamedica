import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { resolveBillingCurrency } from '@/lib/payments/billing-currency'
import { createAstroAdminClient } from '@/lib/supabase'
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service'

export const prerender = false

interface PatientCurrencyRow {
  id: string
  cpf: string | null
  dni: string | null
  care_country: string | null
}

interface StoredWalletRow {
  currency: string | null
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const body = await request.json().catch(() => null)
    const amount = Number(body?.amount)

    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest('invalid_amount')
    }

    const amountCents = Math.round(amount * 100)
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      return badRequest('invalid_amount')
    }

    const supabase = createAstroAdminClient(locals.runtime?.env)

    const [
      { data: patient, error: patientError },
      { data: storedWallet, error: storedWalletError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      supabase
        .from('patients')
        .select('id, cpf, dni, care_country')
        .eq('id', context.patientId)
        .maybeSingle<PatientCurrencyRow>(),
      supabase
        .from('patient_wallets' as never)
        .select('currency')
        .eq('patient_id', context.patientId)
        .maybeSingle<StoredWalletRow>(),
      supabase
        .from('profiles')
        .select('email')
        .eq('user_id', context.userId)
        .maybeSingle(),
    ])

    if (patientError) throw patientError
    if (storedWalletError) throw storedWalletError

    const resolved = resolveBillingCurrency({
      patientCpf: patient?.cpf,
      patientDni: patient?.dni,
      patientCareCountry: patient?.care_country ?? context.careCountry,
      walletCurrency: storedWallet?.currency,
    })

    if (!resolved.ok) {
      return new Response(
        JSON.stringify({ success: false, error: resolved.error }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (profileError || !profile?.email) {
      return badRequest('patient_email_not_found')
    }

    const preference = await appointmentPaymentsService.createWalletTopupPreference(
      supabase,
      context.patientId,
      amountCents,
      profile.email,
      resolved.currency,
      locals.runtime?.env as Record<string, unknown> | undefined,
    )

    return jsonOk({
      preferenceId: preference.preferenceId,
      checkoutUrl: preference.checkoutUrl,
      amountCents,
      currency: resolved.currency,
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'mercadopago_br_token_missing' || code === 'mercadopago_ar_token_missing') {
      logger.error('[patients/wallet/topup] Market credential missing', { code })
      return new Response(
        JSON.stringify({ success: false, error: code }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    logger.error('[patients/wallet/topup] POST error', error)
    return internalError('failed_to_initiate_wallet_topup')
  }
}
