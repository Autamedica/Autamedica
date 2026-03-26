import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { anamnesisService } from '@/lib/patients/services/anamnesis.service'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const snapshot = await anamnesisService.get(createAstroAdminClient(), context.patientId)
    return jsonOk(snapshot)
  } catch (e) {
    logger.error('[anamnesis/GET]', e)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => ({})) as {
    stepId?: unknown
    data?: Record<string, unknown>
    completed?: unknown
  }

  const section = typeof body.stepId === 'string' ? body.stepId : null
  if (!section) return badRequest('missing_step')

  const completed = body.completed === true || body.completed === 'true'

  try {
    const result = await anamnesisService.saveSection(
      createAstroAdminClient(),
      context.patientId,
      section,
      body.data ?? {},
      completed,
    )
    return jsonOk(result)
  } catch (e) {
    logger.error('[anamnesis/POST]', e)
    return internalError()
  }
}

export const PATCH: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  try {
    const updated = await anamnesisService.updateMeta(
      createAstroAdminClient(),
      context.patientId,
      body,
    )
    return jsonOk(updated)
  } catch (e) {
    if (e instanceof Error && (e as NodeJS.ErrnoException & { code?: string }).code === 'NO_UPDATES') {
      return badRequest('no_updates')
    }
    logger.error('[anamnesis/PATCH]', e)
    return internalError()
  }
}
