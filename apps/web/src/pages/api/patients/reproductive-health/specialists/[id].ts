import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { jsonOk, badRequest, internalError, unauthorized, notFound } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { reproductiveHealthService } from '@/lib/patients/services/reproductive-health.service'

export const GET: APIRoute = async ({ request, locals, params }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const specialist = await reproductiveHealthService.getSpecialistById(admin, params.id ?? '')
    if (!specialist) return notFound('Specialist not found')
    return jsonOk(specialist)
  } catch (err) {
    logger.error('[reproductive-health/specialists/GET:id]', err)
    return internalError()
  }
}

export const PATCH: APIRoute = async ({ request, locals, params }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => null)
  if (!body?.status) return badRequest('status is required')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = await reproductiveHealthService.updateAvailability(admin, params.id ?? '', body.status)
    return jsonOk(result)
  } catch (err) {
    logger.error('[reproductive-health/specialists/PATCH]', err)
    return internalError()
  }
}
