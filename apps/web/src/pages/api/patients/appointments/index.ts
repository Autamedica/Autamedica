import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { appointmentsUseCase } from '@/lib/patients/usecases/appointments.usecase'
import { createAppointmentAdapter } from '@/lib/patients/lib/repos/appointments.adapter'
import { jsonOk, unauthorized, notFound, conflict, internalError, forbidden } from '@/lib/api-helpers'
import { validateBody } from '@/lib/validation'
import { CreatePatientAppointmentSchema } from '@/lib/zod/appointments'

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const adminDb = createAstroAdminClient(locals.runtime?.env)
    const data = await appointmentsUseCase.listByPatient({ appointmentsRepo: createAppointmentAdapter(adminDb), dbClient: adminDb }, context.patientId)
    return jsonOk(data)
  } catch (err) {
    logger.error('[appointments/GET]', err)
    return internalError()
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const raw = await request.json().catch(() => ({}))
  const parsed = validateBody(CreatePatientAppointmentSchema, raw)
  if (parsed.success === false) return parsed.error

  const body = parsed.data

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const created = await appointmentsUseCase.create(
      { appointmentsRepo: createAppointmentAdapter(admin), dbClient: admin },
      context.patientId,
      {
        start_time: body.start_time,
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
    if (errCode === 'CARE_COUNTRY' || (errCode === '42501' && String((err as { message?: string }).message).includes('care_country'))) return forbidden('care_country_mismatch_or_unset')
    if (errCode === 'DOCTOR_NOT_FOUND') {
      return notFound('Doctor not found or inactive')
    }
    if (errCode === 'VALIDATION') {
      return conflict((err as Error).message)
    }
    if (errCode === 'P0001' && String((err as { message?: string }).message ?? '').includes('SCHEDULING_CONFLICT')) {
      return conflict('El doctor ya tiene una cita en ese horario')
    }
    logger.error('[appointments/POST]', err)
    return internalError()
  }
}

