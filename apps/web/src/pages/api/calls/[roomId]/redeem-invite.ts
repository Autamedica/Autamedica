import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import {
  badRequest,
  conflict,
  internalError,
  jsonOk,
  notFound,
  serviceUnavailable,
} from '@/lib/api-helpers'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { createCallGuestInviteAdapter } from '@/lib/calls/adapters/call-guest-invites.adapter'
import { redeemGuestInviteUseCase } from '@/lib/calls/usecases/redeem-guest-invite.usecase'
import { resolveGuestSecret } from '@/lib/runtime-env'

export const POST: APIRoute = async ({ request, params, locals }) => {
  const roomId = params.roomId?.trim()
  if (!roomId) return badRequest('missing_room_id')

  try {
    const body = (await request.json()) as { invite?: string }
    const inviteId = body.invite?.trim()
    if (!inviteId) return badRequest('missing_invite_id')

    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) {
      logger.error('[redeem-invite] GUEST_TOKEN_SECRET not configured')
      return serviceUnavailable('guest_invites_not_configured')
    }

    const admin = createAstroAdminClient(locals.runtime?.env)
    const inviteRepo = createCallGuestInviteAdapter(admin)

    const result = await redeemGuestInviteUseCase({ inviteRepo }, { inviteId, roomId })

    if (result.kind === 'error') {
      if (result.reason === 'not_found') {
        logger.warn('[redeem-invite] Invite not found', { inviteId, roomId })
        return notFound('invite_not_found')
      }
      if (result.reason === 'already_redeemed') {
        return conflict('invite_already_used')
      }
      return conflict('invite_expired')
    }

    const token = await signGuestToken(result.data, secret)
    return jsonOk({ token })
  } catch (err) {
    logger.error('[redeem-invite] Error redeeming invite', err)
    return internalError()
  }
}
