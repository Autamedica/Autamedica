import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context'
import { doctorAppointmentsBackendService } from '@/lib/doctors/services/doctor-appointments.backend'
import type { CreateDoctorAppointmentInput } from '@/lib/doctors/types/appointments'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals)
  if (!context) return unauthorized()

  try {
    const data = await doctorAppointmentsBackendService.listForDoctor(
      context.doctorId,
      locals.runtime?.env,
    )
    return jsonOk(data)
  } catch (error) {
    logger.error('[api/doctors/appointments] GET failed', error)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals)
  if (!context) return unauthorized()

  const body = (await request.json().catch(() => ({}))) as Partial<CreateDoctorAppointmentInput>
  if (!body.patient_id?.trim()) return badRequest('patient_id is required')
  if (!body.start_time?.trim()) return badRequest('start_time is required')

  try {
    const created = await doctorAppointmentsBackendService.createForDoctor(
      context,
      {
        patient_id: body.patient_id,
        start_time: body.start_time,
        duration_minutes: body.duration_minutes ?? 30,
        type: body.type ?? 'consultation',
        notes: body.notes,
        location: body.location ?? null,
      },
      locals.runtime?.env,
    )

    return jsonOk(created, 201)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'PATIENT_NOT_FOUND') return notFound('Patient not found or inactive')
    if (code === 'VALIDATION') return badRequest((error as Error).message)

    logger.error('[api/doctors/appointments] POST failed', error)
    return internalError()
  }
}
