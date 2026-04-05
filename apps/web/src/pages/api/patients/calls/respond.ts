import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, isAuthed } from '@/lib/api-auth'
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { callSessionRepo } from '@/lib/calls/repos/call-session.repo'
import { respondCallService } from '@/lib/calls/services/respond-call.service'

export const POST: APIRoute = async ({ request }) => {
  const PATIENT_ROLES = ['patient', 'organization_admin', 'platform_admin', 'admin'] as const
  const auth = await withAuthRole(request, PATIENT_ROLES)
  if (!isAuthed(auth)) return auth

  const body = await request.json().catch(() => ({})) as {
    callId?: string
    action?: string
  }

  const callId = body.callId?.trim()
  const action = body.action?.trim()

  if (!callId) {
    return badRequest('call_id_required')
  }

  if (action !== 'accept' && action !== 'decline') {
    return badRequest('invalid_call_action')
  }

  try {
    const admin = createAstroAdminClient()
    const patientId = await callSessionRepo.resolvePatientProfileIdByUserId(admin, auth.user.id)
    if (!patientId) {
      return forbidden('patient_not_found')
    }

    const result = await respondCallService.respond(admin, auth.supabase, {
      patientId,
      callId,
      action,
    })

    if (result.kind === 'not_found') return notFound(result.message)
    if (result.kind === 'forbidden') return forbidden(result.message)
    if (result.kind === 'conflict') return conflict(result.message)

    return jsonOk(result.data)
  } catch (error) {
    logger.error('[patients/calls/respond] POST error', error)
    return internalError()
  }
}
