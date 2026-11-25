import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { resolveBillingCurrency } from '@/lib/payments/billing-currency'
import { createAstroAdminClient } from '@/lib/supabase'

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

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)

    const [{ data: patient, error: patientError }, { data: storedWallet, error: storedWalletError }] =
      await Promise.all([
        admin
          .from('patients')
          .select('id, cpf, dni, care_country')
          .eq('id', context.patientId)
          .maybeSingle<PatientCurrencyRow>(),
        admin
          .from('patient_wallets' as never)
          .select('currency')
          .eq('patient_id', context.patientId)
          .maybeSingle<StoredWalletRow>(),
      ])

    if (patientError) throw patientError
    if (storedWalletError) throw storedWalletError

    const resolved = resolveBillingCurrency({
      patientCpf: patient?.cpf,
      patientDni: patient?.dni,
      patientCareCountry: patient?.care_country ?? context.careCountry,
      walletCurrency: storedWallet?.currency,
    })

    const resolutionError = !resolved.ok && 'error' in resolved ? resolved.error : null
    if (resolutionError && resolutionError !== 'billing_currency_unresolved') {
      return new Response(
        JSON.stringify({ success: false, error: resolutionError }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )
    }

    let balance = null
    if (storedWallet) {
      const { data: balanceRows, error: balanceError } = await admin
        .rpc('patient_wallet_get_balance' as never, { p_patient_id: context.patientId } as never)

      if (balanceError) throw balanceError

      const balanceData = balanceRows ?? []
      balance = Array.isArray(balanceData) ? balanceData[0] : null
    }

    const { data: movements, error: movementsError } = await admin
      .from('patient_wallet_ledger' as never)
      .select('id, kind, amount_cents, balance_after_cents, currency, appointment_id, reason, expires_at, created_at')
      .eq('patient_id', context.patientId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (movementsError) throw movementsError

    return jsonOk({
      balance: balance ?? {
        patient_id: context.patientId,
        available_credit_cents: 0,
        locked_credit_cents: 0,
        total_credit_cents: 0,
        currency: resolved.ok && 'currency' in resolved ? resolved.currency : null,
      },
      movements: movements ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('patient_id')) return badRequest(message)

    logger.error('[patients/wallet] GET error', error)
    return internalError('failed_to_load_patient_wallet')
  }
}
