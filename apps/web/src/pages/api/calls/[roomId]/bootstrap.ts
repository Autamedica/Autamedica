import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { callSessionBackendService } from '@/lib/calls/services/call-session.backend'

export const GET: APIRoute = async ({ request, params, locals }) => {
  const roomId = params.roomId?.trim()
  if (!roomId) return badRequest('missing_room_id')

  try {
    const auth = await withAuth(request, locals)
    if (!isAuthed(auth)) return auth

    const admin = createAstroAdminClient()
    const result = await callSessionBackendService.getBootstrap(admin, roomId, auth.user.id)

    if (result.kind === 'not_found') return notFound('call_not_found')
    if (result.kind === 'conflict') return conflict(result.message)
    if (result.kind === 'forbidden') return forbidden('call_access_denied')

    return jsonOk(result.data)
  } catch (err) {
    logger.error('[calls/bootstrap/GET]', err)
    return internalError()
  }
}
