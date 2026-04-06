import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { jsonOk, badRequest, internalError, unauthorized } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { preventiveScreeningsService } from '@/lib/patients/services/preventive-screenings.service'

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => null)
  const action = body?.action as string | undefined

  if (action !== 'complete' && action !== 'cancel') {
    return badRequest('Invalid action. Expected "complete" or "cancel"')
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const screeningId = params.id ?? ''

    const result = action === 'complete'
      ? await preventiveScreeningsService.completeScreening(admin, context.patientId, screeningId, body.resultSummary)
      : await preventiveScreeningsService.cancelScreening(admin, screeningId)

    return jsonOk(result)
  } catch (err) {
    logger.error('[screenings/PATCH]', err)
    return internalError()
  }
}
