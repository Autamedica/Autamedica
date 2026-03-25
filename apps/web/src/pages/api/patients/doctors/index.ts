import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { doctorsService } from '@/lib/patients/services/doctors.service'
import { jsonOk, unauthorized, internalError } from '@/lib/api-helpers'

export const GET: APIRoute = async ({ request }) => {
  const context = await resolvePatientContext(request)
  if (!context) return unauthorized()

  try {
    const data = await doctorsService.listActiveDoctors(createAstroAdminClient())
    return jsonOk(data)
  } catch (err) {
    logger.error('[patients/doctors/GET]', err)
    return internalError()
  }
}
