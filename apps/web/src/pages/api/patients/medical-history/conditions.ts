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
    const { name, status: conditionStatus, diagnosed_date, notes } = body as {
      name?: string
      status?: string
      diagnosed_date?: string
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
        type: 'diagnosis',
        title: name.trim(),
        content: { status: conditionStatus, diagnosed_date, notes },
      } as never)
      .select('*')
      .single()

    if (error) {
      logger.error('[medical-history/conditions/POST] Insert failed', error)
      return internalError('Failed to add condition')
    }

    return jsonOk(inserted, 201)
  } catch (err) {
    logger.error('[medical-history/conditions/POST] Unexpected error', err)
    return internalError('Internal server error')
  }
}
