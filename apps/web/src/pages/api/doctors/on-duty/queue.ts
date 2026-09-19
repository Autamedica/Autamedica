import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { pharmacyOnDemandService } from '@/lib/pharmacy/services/pharmacy-on-demand.service'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const queue = await pharmacyOnDemandService.getPendingQueue(admin)

    return jsonOk({
      queue,
      count: queue.length,
    })
  } catch (err) {
    logger.error('[api/doctors/on-duty/queue] GET error', err)
    return internalError('Error al obtener cola de solicitudes en farmacia')
  }
}
