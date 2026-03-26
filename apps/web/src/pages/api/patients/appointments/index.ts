import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { appointmentsService } from '@/lib/patients/services/appointments.service'
import { jsonOk, unauthorized, badRequest, notFound, conflict, internalError } from '@/lib/api-helpers'
import type { AppointmentType } from '@/lib/patients/types/appointment'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const data = await appointmentsService.listByPatient(createAstroAdminClient(), context.patientId)
    return jsonOk(data)
  } catch (err) {
    logger.error('[appointments/GET]', err)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const body = await request.json().catch(() => ({})) as {
    scheduled_at?: string
    doctor_id?: string
    duration_minutes?: number
    type?: AppointmentType
    notes?: string
    reason?: string
    meeting_url?: string
    location?: string
  }

  if (!body.scheduled_at?.trim()) return badRequest('scheduled_at is required')
  if (!body.doctor_id?.trim()) return badRequest('doctor_id is required')

  try {
    const created = await appointmentsService.create(
      createAstroAdminClient(),
      context.patientId,
      {
        scheduled_at: body.scheduled_at,
        doctor_id: body.doctor_id,
        duration_minutes: body.duration_minutes,
        type: body.type,
        notes: body.notes,
        reason: body.reason,
        meeting_url: body.meeting_url,
        location: body.location,
      },
    )
    return jsonOk(created, 201)
  } catch (err) {
    const errCode = (err as { code?: string }).code
    if (errCode === 'DOCTOR_NOT_FOUND') {
      return notFound('Doctor not found or inactive')
    }
    if (errCode === 'P0001' && String((err as { message?: string }).message ?? '').includes('SCHEDULING_CONFLICT')) {
      return conflict('El doctor ya tiene una cita en ese horario')
    }
    logger.error('[appointments/POST]', err)
    return internalError()
  }
}
