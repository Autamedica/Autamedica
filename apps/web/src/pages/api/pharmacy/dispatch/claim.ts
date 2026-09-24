import type { APIRoute } from 'astro'
import { badRequest, forbidden, internalError, jsonFail, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'

type DispatchClaimResult = {
  success: boolean
  code?: string
  message?: string
  request_id?: string
  cloudflare_room_id?: string
  patient_dni?: string
  patient_phone?: string
  tier_requested?: string
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const session = locals.session
    if (!session?.user) {
      return unauthorized('Sesión requerida')
    }

    const body = await request.json().catch(() => null)
    if (!body?.requestId) {
      return badRequest('ID de solicitud requerido')
    }

    const { requestId } = body
    const supabase = createAstroAdminClient(locals.runtime?.env)

    // Validar que el usuario sea médico
    const { data: doctor, error: docError } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (docError || !doctor) {
      return forbidden('Usuario no autorizado como médico')
    }

    // Ejecutar RPC atómica con SKIP LOCKED
    const { data: claimResult, error: claimError } = await supabase.rpc(
      'claim_pharmacy_request_tier',
      {
        p_request_id: requestId,
        p_doctor_id: doctor.id,
      }
    )

    if (claimError) {
      logger.error('[api/pharmacy/dispatch/claim] RPC error', { claimError })
      return internalError(claimError.message)
    }

    const result = claimResult as unknown as DispatchClaimResult | null

    if (!result?.success) {
      return jsonFail(
        'CONFLICT',
        result?.message || 'La consulta ya no está disponible',
        409,
        result
      )
    }

    return jsonOk(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado'
    logger.error('[api/pharmacy/dispatch/claim] Exception', { err })
    return internalError(message)
  }
}
