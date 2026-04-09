import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'
import { psychiatryIntakeService } from '@/lib/patients/services/psychiatry-intake.service'
import {
  SavePsychiatrySectionSchema,
  UpdatePsychiatryMetaSchema,
} from '@/lib/patients/lib/zod/psychiatry-intake'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const snapshot = await psychiatryIntakeService.get(createAstroAdminClient(), context.patientId)
    return jsonOk(snapshot)
  } catch (error) {
    logger.error('[psychiatry-intake/GET]', error)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const raw = await request.json().catch(() => ({}))
  const parsed = SavePsychiatrySectionSchema.safeParse(raw)
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'invalid_input')
  }

  try {
    const result = await psychiatryIntakeService.saveSection(
      createAstroAdminClient(),
      context.patientId,
      parsed.data.stepId,
      parsed.data.data,
      parsed.data.completed,
      parsed.data.phase,
    )
    return jsonOk(result)
  } catch (error) {
    logger.error('[psychiatry-intake/POST]', error)
    return internalError()
  }
}

export const PATCH: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const raw = await request.json().catch(() => ({}))
  const parsed = UpdatePsychiatryMetaSchema.safeParse(raw)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'invalid_input'
    return badRequest(message === 'At least one field is required' ? 'no_updates' : message)
  }

  try {
    const result = await psychiatryIntakeService.updateMeta(
      createAstroAdminClient(),
      context.patientId,
      parsed.data,
    )
    return jsonOk(result)
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException & { code?: string }).code === 'NO_UPDATES') {
      return badRequest('no_updates')
    }
    logger.error('[psychiatry-intake/PATCH]', error)
    return internalError()
  }
}
