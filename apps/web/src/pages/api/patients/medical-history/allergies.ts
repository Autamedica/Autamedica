import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { medicalHistoryService } from '@/lib/patients/services/medical-history.service'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request }) => {
  const context = await resolvePatientContext(request)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => ({})) as {
    name?: string
    severity?: string
    reaction?: string
    notes?: string
  }

  if (!body.name?.trim()) return badRequest('name is required')

  try {
    const supabase = createServerClientFromRequest(request)
    const inserted = await medicalHistoryService.addAllergy(
      supabase,
      context.patientId,
      body.name,
      { severity: body.severity, reaction: body.reaction, notes: body.notes },
    )
    return jsonOk(inserted, 201)
  } catch (err) {
    logger.error('[medical-history/allergies/POST]', err)
    return internalError()
  }
}
