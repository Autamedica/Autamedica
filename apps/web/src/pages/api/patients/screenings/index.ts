import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { jsonOk, badRequest, internalError, unauthorized } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { preventiveScreeningsService } from '@/lib/patients/services/preventive-screenings.service'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const data = await preventiveScreeningsService.getOverview(admin, context.patientId)
    return jsonOk(data)
  } catch (err) {
    logger.error('[screenings/GET]', err)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => null)
  if (!body?.screeningId || !body?.scheduledDate) {
    return badRequest('screeningId and scheduledDate are required')
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = await preventiveScreeningsService.scheduleScreening(
      admin, context.patientId, body.screeningId, body.scheduledDate,
    )
    return jsonOk(result, 201)
  } catch (err) {
    logger.error('[screenings/POST]', err)
    return internalError()
  }
}
