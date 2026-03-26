import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { medicalHistoryService } from '@/lib/patients/services/medical-history.service'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => ({})) as {
    name?: string
    dosage?: string
    frequency?: string
    status?: string
    notes?: string
  }

  if (!body.name?.trim()) return badRequest('name is required')

  try {
    const supabase = createServerClientFromRequest(request)
    const inserted = await medicalHistoryService.addMedication(
      supabase,
      context.patientId,
      body.name,
      { dosage: body.dosage, frequency: body.frequency, status: body.status, notes: body.notes },
    )
    return jsonOk(inserted, 201)
  } catch (err) {
    logger.error('[medical-history/medications/POST]', err)
    return internalError()
  }
}
