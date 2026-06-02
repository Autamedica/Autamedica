import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const { data: balanceRows, error: balanceError } = await admin
      .rpc('patient_wallet_get_balance' as never, { p_patient_id: context.patientId } as never)

    if (balanceError) throw balanceError

    const balanceData = balanceRows ?? []
    const balance = Array.isArray(balanceData) ? balanceData[0] : null

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
        currency: 'ARS',
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
