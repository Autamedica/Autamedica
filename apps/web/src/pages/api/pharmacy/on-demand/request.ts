import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers'
import { CreatePharmacyRequestSchema } from '@/lib/pharmacy/types'
import { pharmacyOnDemandService } from '@/lib/pharmacy/services/pharmacy-on-demand.service'

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = (await request.json().catch(() => null)) as unknown
    const parsed = CreatePharmacyRequestSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Datos de solicitud inválidos'
      return badRequest(firstError)
    }

    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = await pharmacyOnDemandService.createRequest(admin, parsed.data)

    return jsonOk(result)
  } catch (err) {
    logger.error('[api/pharmacy/on-demand/request] POST error', err)
    return internalError('Error al crear solicitud de consulta en farmacia')
  }
}
