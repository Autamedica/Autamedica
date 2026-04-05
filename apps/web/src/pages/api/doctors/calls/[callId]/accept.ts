import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { jsonOk, internalError } from '@/lib/api-helpers'

import { callSessionRepo } from '@/lib/calls/repos/call-session.repo'

export const POST: APIRoute = async ({ params, request }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES)
  if (!isAuthed(auth)) return auth

  const { callId } = params
  if (!callId) return new Response(null, { status: 400 })

  try {
    await callSessionRepo.acceptCall(auth.supabase, callId)
    return jsonOk({ status: 'in_progress' })
  } catch (error) {
    logger.error('[calls/accept] POST error', error)
    return internalError()
  }
}
