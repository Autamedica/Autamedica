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
    
    // Obtener balance y estado de suscripción mediante RPC
    const { data: balanceRows, error: balanceError } = await admin
      .rpc('patient_health_reserve_get_balance' as never, { p_patient_id: context.patientId } as never)

    if (balanceError) throw balanceError

    const balanceData = balanceRows ?? []
    const balance = Array.isArray(balanceData) ? balanceData[0] : null

    // Obtener movimientos del ledger inmutable
    const { data: movements, error: movementsError } = await admin
      .from('patient_health_reserve_ledger' as never)
      .select('id, amount_credits, kind, ref, balance_after, voucher_id, appointment_id, metadata, created_at')
      .eq('patient_id', context.patientId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (movementsError) throw movementsError

    // Obtener vouchers activos
    const { data: vouchers, error: vouchersError } = await admin
      .from('benefit_vouchers' as never)
      .select('id, voucher_code, credits_spent, copay_amount_cents, status, expires_at, redeemed_at, created_at, metadata, catalog_item_id')
      .eq('patient_id', context.patientId)
      .order('created_at', { ascending: false })

    if (vouchersError) throw vouchersError

    return jsonOk({
      reserve: balance ?? {
        patient_id: context.patientId,
        benefit_balance: 0,
        max_cap_credits: 600,
        status: 'active',
        subscription_tier: 'free',
        subscription_status: 'active',
      },
      movements: movements ?? [],
      vouchers: vouchers ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('patient_id')) return badRequest(message)

    logger.error('[patients/reserva-saude] GET error', error)
    return internalError('failed_to_load_patient_health_reserve')
  }
}
