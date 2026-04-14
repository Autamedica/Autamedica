import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { callSessionBackendService } from '@/lib/calls/services/call-session.backend'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { getRuntimeEnvValue } from '@/lib/runtime-env'

function resolveGuestSecret(runtimeEnv?: Record<string, unknown>): string | undefined {
  return getRuntimeEnvValue('GUEST_TOKEN_SECRET')
    ?? (runtimeEnv as Record<string, string> | undefined)?.GUEST_TOKEN_SECRET
    ?? import.meta.env.GUEST_TOKEN_SECRET
    ?? undefined
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7)
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  const roomId = params.roomId?.trim()
  if (!roomId) return badRequest('missing_room_id')

  try {
    const bearerToken = extractBearerToken(request)

    // Guest path: verify JWT token instead of Supabase session
    if (bearerToken) {
      const secret = resolveGuestSecret(locals.runtime?.env)
      if (!secret) {
        logger.error('[calls/bootstrap/GET] GUEST_TOKEN_SECRET not configured')
        return internalError()
      }

      const guest = await verifyGuestToken(bearerToken, secret)
      if (!guest) return unauthorized()

      const admin = createAstroAdminClient(locals.runtime?.env)
      const result = await callSessionBackendService.getGuestBootstrap(admin, roomId, guest, bearerToken)

      if (result.kind === 'not_found') return notFound('call_not_found')
      if (result.kind === 'conflict') return conflict(result.message)
      if (result.kind === 'forbidden') return forbidden('call_access_denied')

      return jsonOk(result.data)
    }

    // Authenticated path: standard Supabase session
    const auth = await withAuth(request, locals)
    if (!isAuthed(auth)) return auth

    const admin = createAstroAdminClient(locals.runtime?.env)
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
