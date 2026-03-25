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
    status?: string
    diagnosed_date?: string
    notes?: string
  }

  if (!body.name?.trim()) return badRequest('name is required')

  try {
    const supabase = createServerClientFromRequest(request)
    const inserted = await medicalHistoryService.addCondition(
      supabase,
      context.patientId,
      body.name,
      { status: body.status, diagnosed_date: body.diagnosed_date, notes: body.notes },
    )
    return jsonOk(inserted, 201)
  } catch (err) {
    logger.error('[medical-history/conditions/POST]', err)
    return internalError()
  }
}
