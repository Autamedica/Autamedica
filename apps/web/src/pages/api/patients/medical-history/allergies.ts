import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return unauthorized('Unauthorized')
    }

    const body = await request.json()
    const { name, severity, reaction, notes } = body as {
      name?: string
      severity?: string
      reaction?: string
      notes?: string
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return badRequest('name is required')
    }

    const supabase = createServerClientFromRequest(request)

    const { data: inserted, error } = await supabase
      .from('medical_records')
      .insert({
        patient_id: context.patientId,
        type: 'allergy',
        title: name.trim(),
        content: { severity, reaction, notes },
      } as never)
      .select('*')
      .single()

    if (error) {
      logger.error('[medical-history/allergies/POST] Insert failed', error)
      return internalError('Failed to add allergy')
    }

    return jsonOk(inserted, 201)
  } catch (err) {
    logger.error('[medical-history/allergies/POST] Unexpected error', err)
    return internalError('Internal server error')
  }
}
