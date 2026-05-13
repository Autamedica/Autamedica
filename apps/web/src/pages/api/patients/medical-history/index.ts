import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { medicalHistoryService } from '@/lib/patients/services/medical-history.service'
import { jsonOk, unauthorized, internalError } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const data = await medicalHistoryService.getFullHistory(createAstroAdminClient(locals.runtime?.env), context.patientId)
    const response = jsonOk(data)
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  } catch (err) {
    logger.error('[medical-history/GET]', err)
    return internalError()
  }
}
