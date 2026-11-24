import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroServerClientFromRequest } from '@/lib/supabase'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { medicalHistoryService } from '@/lib/patients/services/medical-history.service'
import { jsonOk, unauthorized, badRequest, forbidden, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => ({})) as {
    name?: string
    severity?: string
    reaction?: string
    notes?: string
  }

  if (!body.name?.trim()) return badRequest('name is required')

  try {
    const supabase = createAstroServerClientFromRequest(request, locals.runtime?.env)
    const inserted = await medicalHistoryService.addAllergy(
      supabase,
      context.patientId,
      body.name,
      { severity: body.severity, reaction: body.reaction, notes: body.notes },
    )
    return jsonOk(inserted, 201)
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined
    if (code === '42501') {
      logger.warn('[medical-history/allergies/POST] RLS restricted', { patientId: context.patientId })
      return forbidden('clinical_write_restricted')
    }
    logger.error('[medical-history/allergies/POST]', err)
    return internalError()
  }
}
