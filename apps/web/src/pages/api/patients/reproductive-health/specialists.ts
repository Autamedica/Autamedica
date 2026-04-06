import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { jsonOk, internalError, unauthorized } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { reproductiveHealthService } from '@/lib/patients/services/reproductive-health.service'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const url = new URL(request.url)
  const filters = {
    specialty: url.searchParams.get('specialty') ?? undefined,
    availableOnly: url.searchParams.get('availableOnly') === 'true',
    certifiedOnly: url.searchParams.get('certifiedOnly') === 'true',
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const data = await reproductiveHealthService.listSpecialists(admin, filters)
    return jsonOk(data)
  } catch (err) {
    logger.error('[reproductive-health/specialists/GET]', err)
    return internalError()
  }
}
