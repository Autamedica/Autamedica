import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { medicalHistoryService } from '@/lib/patients/services/medical-history.service'
import { jsonOk, unauthorized, internalError } from '@/lib/api-helpers'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const supabase = createServerClientFromRequest(request)
    const data = await medicalHistoryService.getFullHistory(supabase, context.patientId)
    return jsonOk(data)
  } catch (err) {
    logger.error('[medical-history/GET]', err)
    return internalError()
  }
}
