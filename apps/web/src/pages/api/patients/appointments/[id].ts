import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { appointmentsService } from '@/lib/patients/services/appointments.service'
import type { AppointmentStatus, AppointmentType } from '@/lib/patients/types/appointment'
import { jsonOk, unauthorized, badRequest, notFound, internalError } from '@/lib/api-helpers'

export const GET: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  if (!params.id) return badRequest('Missing appointment id')

  try {
    const supabase = createServerClientFromRequest(request)
    const data = await appointmentsService.getById(supabase, params.id, context.patientId)
    if (!data) return notFound('Appointment not found')
    return jsonOk(data)
  } catch (err) {
    logger.error('[appointments/[id]/GET]', err)
    return internalError()
  }
}

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  if (!params.id) return badRequest('Missing appointment id')

  const body = await request.json().catch(() => ({})) as {
    scheduled_at?: string
    duration_minutes?: number
    status?: AppointmentStatus
    type?: AppointmentType
    notes?: string
    meeting_url?: string | null
    location?: string | null
  }

  try {
    const supabase = createServerClientFromRequest(request)
    const updated = await appointmentsService.update(supabase, params.id, context.patientId, body)
    return jsonOk(updated)
  } catch (err) {
    logger.error('[appointments/[id]/PATCH]', err)
    return internalError()
  }
}

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  if (!params.id) return badRequest('Missing appointment id')

  try {
    const supabase = createServerClientFromRequest(request)
    const cancelled = await appointmentsService.cancel(supabase, params.id, context.patientId)
    if (!cancelled) return notFound('Appointment not found')
    return jsonOk(cancelled)
  } catch (err) {
    logger.error('[appointments/[id]/DELETE]', err)
    return internalError()
  }
}
