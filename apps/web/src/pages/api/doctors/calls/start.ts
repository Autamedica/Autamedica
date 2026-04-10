import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'

import { createAstroAdminClient } from '@/lib/supabase'
import { startTeleconsultationUseCase } from '@/lib/calls/usecases/start-teleconsultation.usecase'
import { createCallStartAdapter } from '@/lib/calls/repos/call-start.adapter'

export const POST: APIRoute = async ({ request }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES)
  if (!isAuthed(auth)) return auth

  const body = await request.json().catch(() => ({})) as {
    patientId?: string
    appointmentId?: string
  }

  const patientId = body.patientId?.trim()
  const appointmentId = body.appointmentId?.trim()

  if (!patientId) {
    return badRequest('patient_id_required')
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const adminCallRepo = createCallStartAdapter(admin)
    const actorCallRepo = createCallStartAdapter(auth.supabase)

    const result = await startTeleconsultationUseCase(
      { adminCallRepo, actorCallRepo, adminDb: admin },
      {
      doctorUserId: auth.user.id,
      patientId,
      ...(appointmentId ? { appointmentId } : {}),
    })

    if (result.kind === 'not_found') return notFound(result.message)
    if (result.kind === 'forbidden') return forbidden(result.message)
    if (result.kind === 'conflict') return conflict(result.message)

    return jsonOk(result.data)
  } catch (error) {
    logger.error('[doctors/calls/start] POST error', error)
    return internalError()
  }
}
