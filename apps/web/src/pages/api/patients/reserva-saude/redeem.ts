import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const body = await request.json()
    const catalogItemId = typeof body.catalogItemId === 'string' ? body.catalogItemId.trim() : null
    const copayAmountCents = Number(body.copayAmountCents ?? 0)
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : null

    if (!catalogItemId) {
      return badRequest('catalogItemId is required')
    }

    const admin = createAstroAdminClient(locals.runtime?.env)

    const { data: result, error } = await admin.rpc('redeem_reserve_benefit' as never, {
      p_patient_id: context.patientId,
      p_catalog_item_id: catalogItemId,
      p_copay_amount_cents: Number.isInteger(copayAmountCents) && copayAmountCents > 0 ? copayAmountCents : 0,
      p_idempotency_key: idempotencyKey,
    } as never)

    if (error) {
      const msg = error.message || ''
      if (msg.includes('insufficient_benefit_balance')) {
        return badRequest('Saldo insuficiente de AUTA Créditos para este resgate')
      }
      if (msg.includes('catalog_item_not_found')) {
        return badRequest('O serviço solicitado não está disponível no catálogo')
      }
      throw error
    }

    return jsonOk({
      success: true,
      data: result,
    }, 201)
  } catch (error) {
    logger.error('[patients/reserva-saude/redeem] POST error', error)
    return internalError('failed_to_redeem_benefit')
  }
}
