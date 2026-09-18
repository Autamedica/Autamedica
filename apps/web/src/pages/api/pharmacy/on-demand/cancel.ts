import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers'
import { pharmacyOnDemandService } from '@/lib/pharmacy/services/pharmacy-on-demand.service'

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json().catch(() => null)) as { requestId?: string } | null
    const requestId = body?.requestId?.trim()

    if (!requestId) {
      return badRequest('missing_request_id')
    }

    const admin = createAstroAdminClient(locals.runtime?.env)
    const cancelled = await pharmacyOnDemandService.cancelRequest(admin, requestId)

    return jsonOk({ cancelled })
  } catch (err) {
    logger.error('[api/pharmacy/on-demand/cancel] POST error', err)
    return internalError('Error al cancelar solicitud')
  }
}
