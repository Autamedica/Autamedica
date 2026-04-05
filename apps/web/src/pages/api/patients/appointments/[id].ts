import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { checkConflict } from '@autamedica/scheduling'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { appointmentsUseCase } from '@/lib/patients/usecases/appointments.usecase'
import { createAppointmentAdapter } from '@/lib/patients/lib/repos/appointments.adapter'
import { computeEndTime } from '@/lib/patients/api/appointment-utils'
import { jsonOk, unauthorized, badRequest, notFound, internalError, conflict } from '@/lib/api-helpers'
import { validateBody } from '@/lib/validation'
import { UpdatePatientAppointmentSchema } from '@/lib/zod/appointments'

export const GET: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  if (!params.id) return badRequest('Missing appointment id')

  try {
    const supabase = createServerClientFromRequest(request)
    const deps = { appointmentsRepo: createAppointmentAdapter(supabase), dbClient: supabase }
    const data = await appointmentsUseCase.getById(deps, params.id, context.patientId)
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

  const raw = await request.json().catch(() => ({}))
  const validation = validateBody(UpdatePatientAppointmentSchema, raw)
  if (!validation.success) return validation.error

  const body = validation.data

  try {
    const supabase = createServerClientFromRequest(request)
    const deps = { appointmentsRepo: createAppointmentAdapter(supabase), dbClient: supabase }

    if (body.start_time) {
      const existing = await appointmentsUseCase.getById(deps, params.id, context.patientId)
      if (!existing) return notFound('Appointment not found')
      if (!existing.doctor_id) return badRequest('Cannot reschedule: no doctor assigned')

      const duration = body.duration_minutes ?? existing.duration_minutes ?? 30
      const endTime = computeEndTime(body.start_time, duration)
      const hasConflict = await checkConflict(supabase, existing.doctor_id, body.start_time, endTime)
      if (hasConflict) return conflict('Doctor has a conflicting appointment at the requested time')
    }

    const updated = await appointmentsUseCase.update(deps, params.id, context.patientId, body)
    return jsonOk(updated)
  } catch (err) {
    const typed = err as { code?: string; message?: string }
    if (typed.code === 'INVALID_TRANSITION') return badRequest(typed.message ?? 'Invalid status transition')
    if (typed.code === 'NOT_FOUND') return notFound('Appointment not found')
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
    const deps = { appointmentsRepo: createAppointmentAdapter(supabase), dbClient: supabase }
    const cancelled = await appointmentsUseCase.cancel(deps, params.id, context.patientId)
    if (!cancelled) return notFound('Appointment not found')
    return jsonOk(cancelled)
  } catch (err) {
    logger.error('[appointments/[id]/DELETE]', err)
    return internalError()
  }
}
