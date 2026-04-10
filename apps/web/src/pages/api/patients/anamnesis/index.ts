import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { anamnesisService } from '@/lib/patients/services/anamnesis.service'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'
import { SaveSectionSchema, UpdateMetaSchema } from '@/lib/patients/lib/zod/anamnesis'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const snapshot = await anamnesisService.get(createAstroAdminClient(locals.runtime?.env), context.patientId)
    return jsonOk(snapshot)
  } catch (e) {
    logger.error('[anamnesis/GET]', e)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const raw = await request.json().catch(() => ({}))
  const parsed = SaveSectionSchema.safeParse(raw)
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? 'invalid_input')
  }

  const { stepId, data, completed } = parsed.data

  try {
    const result = await anamnesisService.saveSection(
      createAstroAdminClient(locals.runtime?.env),
      context.patientId,
      stepId,
      data,
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

  const raw = await request.json().catch(() => ({}))
  const parsed = UpdateMetaSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'invalid_input'
    return badRequest(msg === 'At least one field is required' ? 'no_updates' : msg)
  }

  try {
    const updated = await anamnesisService.updateMeta(
      createAstroAdminClient(locals.runtime?.env),
      context.patientId,
      parsed.data,
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
