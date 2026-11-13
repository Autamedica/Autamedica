import type { APIRoute } from 'astro'
import { logger, BASE_URL_BY_ROLE } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { pharmacyOnDemandService } from '@/lib/pharmacy/services/pharmacy-on-demand.service'

export const GET: APIRoute = async ({ request, params, locals }) => {
  const requestId = params.id?.trim()
  if (!requestId) return badRequest('missing_request_id')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const siteUrl = (locals.runtime?.env?.PUBLIC_SITE_URL as string) || BASE_URL_BY_ROLE['patient']
    const origin = siteUrl ? new URL(siteUrl).origin : new URL(request.url).origin

    const status = await pharmacyOnDemandService.getRequestStatus(admin, requestId, origin)

    if (!status) {
      return notFound('Solicitud no encontrada')
    }

    return jsonOk(status)
  } catch (err) {
    logger.error('[api/pharmacy/on-demand/status/[id]] GET error', err)
    return internalError('Error al consultar estado de la solicitud')
  }
}
