import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, conflict, internalError, jsonOk, notFound, serviceUnavailable } from '@/lib/api-helpers'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret } from '@/lib/runtime-env'

export const POST: APIRoute = async ({ request, params, locals }) => {
  const roomId = params.roomId?.trim()
  if (!roomId) return badRequest('missing_room_id')

  try {
    const body = await request.json()
    const inviteId = body.invite?.trim()
    
    if (!inviteId) return badRequest('missing_invite_id')

    const admin = createAstroAdminClient(locals.runtime?.env)

    // 1. Buscar la invitación opaca (bypass de tipado estricto por si no se actualizó el cache de TS)
    const { data: invite, error } = await admin
      .from('call_guest_invites')
      .select('*')
      .eq('id', inviteId)
      .eq('room_id', roomId)
      .maybeSingle()

    if (error || !invite) {
      logger.warn('[redeem-invite] Invalid or not found invite', { inviteId, roomId })
      return notFound('invite_not_found')
    }

    const inviteData = invite as any

    // 2. Verificar que no haya expirado ni haya sido usada
    if (inviteData.used_at) {
      return conflict('invite_already_used')
    }

    if (new Date(inviteData.expires_at) < new Date()) {
      return conflict('invite_expired')
    }

    // 3. Marcar como usada
    await admin
      .from('call_guest_invites')
      .update({ used_at: new Date().toISOString() } as any)
      .eq('id', inviteId)

    // 4. Emitir Credencial Efímera (JWT)
    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) {
      logger.error('[redeem-invite] GUEST_TOKEN_SECRET not configured')
      return serviceUnavailable('guest_invites_not_configured')
    }

    const token = await signGuestToken({ 
      callId: inviteData.call_id, 
      roomId: inviteData.room_id, 
      guestName: inviteData.guest_name 
    }, secret)

    return jsonOk({ token })
  } catch (err) {
    logger.error('[redeem-invite] Error redeeming invite', err)
    return internalError()
  }
}