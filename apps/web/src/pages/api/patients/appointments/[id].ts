import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { appointmentsUseCase } from '@/lib/patients/usecases/appointments.usecase'
import { createAppointmentAdapter } from '@/lib/patients/lib/repos/appointments.adapter'
import { jsonOk, unauthorized, badRequest, notFound, internalError } from '@/lib/api-helpers'
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
    const deps = { appointmentsRepo: createAppointmentAdapter(supabase), dbClient: supabase }
    const updated = await appointmentsUseCase.update(deps, params.id, context.patientId, body)
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
    const deps = { appointmentsRepo: createAppointmentAdapter(supabase), dbClient: supabase }
    const cancelled = await appointmentsUseCase.cancel(deps, params.id, context.patientId)
    if (!cancelled) return notFound('Appointment not found')
    return jsonOk(cancelled)
  } catch (err) {
    logger.error('[appointments/[id]/DELETE]', err)
    return internalError()
  }
}
