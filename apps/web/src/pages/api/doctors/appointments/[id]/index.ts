import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context'
import { doctorAppointmentsBackendService } from '@/lib/doctors/services/doctor-appointments.backend'
import type { UpdateDoctorAppointmentInput } from '@/lib/doctors/types/appointments'

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const context = await resolveDoctorContext(request, locals)
  if (!context) return unauthorized()

  const { id } = params
  if (!id?.trim()) return badRequest('appointment id is required')

  const body = (await request.json().catch(() => ({}))) as Partial<UpdateDoctorAppointmentInput>

  const hasFields =
    body.start_time !== undefined ||
    body.duration_minutes !== undefined ||
    body.type !== undefined ||
    body.notes !== undefined ||
    body.location !== undefined

  if (!hasFields) return badRequest('at least one field to update is required')

  if (body.duration_minutes !== undefined && (!Number.isFinite(body.duration_minutes) || body.duration_minutes < 5)) {
    return badRequest('duration_minutes must be at least 5')
  }

  try {
    const updated = await doctorAppointmentsBackendService.updateForDoctor(
      id,
      context.doctorId,
      {
        start_time: body.start_time,
        duration_minutes: body.duration_minutes,
        type: body.type,
        notes: body.notes,
        location: body.location,
      },
      locals.runtime?.env,
    )

    return jsonOk(updated)
  } catch (error) {
    const pgCode = (error as { code?: string }).code
    if (pgCode === 'PGRST116') return badRequest('Appointment not found or not owned by this doctor')

    logger.error('[api/doctors/appointments/[id]] PATCH failed', error)
    return internalError()
  }
}
