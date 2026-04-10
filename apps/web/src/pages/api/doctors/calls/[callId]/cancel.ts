import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'

import { createAstroAdminClient } from '@/lib/supabase'
import { cancelCallService } from '@/lib/calls/services/cancel-call.service'

export const POST: APIRoute = async ({ request, params, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES)
  if (!isAuthed(auth)) return auth

  const callId = params.callId?.trim()
  if (!callId) {
    return badRequest('call_id_required')
  }

  const body = await request.json().catch(() => ({})) as {
    reason?: string
  }

  const reason = body.reason?.trim()
  if (reason !== undefined && reason !== '' && reason !== 'doctor_canceled' && reason !== 'no_answer_timeout') {
    return badRequest('invalid_cancel_reason')
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = await cancelCallService.cancel(admin, auth.supabase, {
      doctorUserId: auth.user.id,
      callId,
      reason: reason === 'no_answer_timeout' ? 'no_answer_timeout' : 'doctor_canceled',
    })

    if (result.kind === 'not_found') return notFound(result.message)
    if (result.kind === 'forbidden') return forbidden(result.message)
    if (result.kind === 'conflict') return conflict(result.message)

    return jsonOk(result.data)
  } catch (error) {
    logger.error('[doctors/calls/[callId]/cancel] POST error', error)
    return internalError()
  }
}
