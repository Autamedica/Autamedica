import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { startCallService } from '@/lib/calls/services/start-call.service'

export const POST: APIRoute = async ({ request }) => {
  const auth = await withAuth(request)
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
    const admin = createAstroAdminClient()
    const result = await startCallService.startCall(admin, auth.supabase, {
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
