import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { callSessionRepo } from '@/lib/calls/repos/call-session.repo'
import { persistCallStatusService } from '@/lib/calls/services/persist-call-status.service'

export const POST: APIRoute = async ({ request, params }) => {
  const auth = await withAuth(request)
  if (!isAuthed(auth)) return auth

  const callId = params.callId?.trim()
  if (!callId) {
    return badRequest('call_id_required')
  }

  const body = await request.json().catch(() => ({})) as {
    status?: string
    reason?: string
  }

  const status = body.status?.trim()
  const reason = body.reason?.trim()

  if (status !== 'connecting' && status !== 'connected' && status !== 'ended') {
    return badRequest('invalid_call_status')
  }

  try {
    const admin = createAstroAdminClient()
    const [doctorProfileId, patientProfileId] = await Promise.all([
      callSessionRepo.resolveDoctorProfileIdByUserId(admin, auth.user.id),
      callSessionRepo.resolvePatientProfileIdByUserId(admin, auth.user.id),
    ])

    const result = await persistCallStatusService.persist(admin, auth.supabase, {
      callId,
      status,
      ...(reason ? { reason } : {}),
      viewer: {
        userId: auth.user.id,
        doctorProfileId,
        patientProfileId,
      },
    })

    if (result.kind === 'not_found') return notFound(result.message)
    if (result.kind === 'forbidden') return forbidden(result.message)
    if (result.kind === 'conflict') return conflict(result.message)

    return jsonOk(result.data)
  } catch (error) {
    logger.error('[calls/[callId]/status] POST error', error)
    return internalError()
  }
}
