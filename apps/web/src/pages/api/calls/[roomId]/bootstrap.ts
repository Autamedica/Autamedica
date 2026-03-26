import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'
import { badRequest, forbidden, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'
import { callSessionBackendService } from '@/lib/calls/services/call-session.backend'

export const GET: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId?.trim()
  if (!roomId) return badRequest('missing_room_id')

  try {
    const supabase = createAstroServerClientFromRequest(request)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return unauthorized()
    }

    const admin = createAstroAdminClient()
    const result = await callSessionBackendService.getBootstrap(admin, roomId, user.id)

    if (result.kind === 'not_found') return notFound('call_not_found')
    if (result.kind === 'conflict') return conflict(result.message)
    if (result.kind === 'forbidden') return forbidden('call_access_denied')

    return jsonOk(result.data)
  } catch (err) {
    logger.error('[calls/bootstrap/GET]', err)
    return internalError()
  }
}
