import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { doctorsService } from '@/lib/patients/services/doctors.service'
import { jsonOk, unauthorized, internalError, conflict } from '@/lib/api-helpers'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  if (!context.careCountry) return conflict('care_country_required')

  try {
    const data = await doctorsService.listActiveDoctors(createAstroAdminClient(locals.runtime?.env), context.careCountry)
    return jsonOk(data)
  } catch (err) {
    logger.error('[patients/doctors/GET]', err)
    return internalError()
  }
}

