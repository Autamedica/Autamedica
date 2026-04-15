import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, forbidden, internalError, jsonOk, notFound, serviceUnavailable } from '@/lib/api-helpers'
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { getRuntimeEnvValue } from '@/lib/runtime-env'

function resolveGuestSecret(runtimeEnv?: Record<string, unknown>): string | undefined {
  return getRuntimeEnvValue('GUEST_TOKEN_SECRET')
    ?? (runtimeEnv as Record<string, string> | undefined)?.GUEST_TOKEN_SECRET
    ?? import.meta.env.GUEST_TOKEN_SECRET
    ?? undefined
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const callId = params.callId?.trim()
  if (!callId) return badRequest('missing_call_id')

  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : ''
  if (!guestName) return badRequest('missing_guest_name')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)

    // Verify call exists and doctor owns it
    const { data: call, error: callError } = await admin
      .from('calls')
      .select('id, room_id, doctor_id, status')
      .eq('id', callId)
      .maybeSingle()

    if (callError) {
      logger.error('[guest-link] call lookup failed', callError)
      return internalError()
    }
    if (!call) return notFound('call_not_found')

    // Verify requesting doctor owns this call
    const { data: doctor } = await admin
      .from('doctors')
      .select('id')
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (doctor?.id !== (call as { doctor_id: string }).doctor_id) {
      return forbidden('not_call_owner')
    }

    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) {
      logger.error('[guest-link] GUEST_TOKEN_SECRET not configured')
      return serviceUnavailable('guest_invites_not_configured')
    }

    const roomId = (call as { room_id: string }).room_id
    const token = await signGuestToken({ callId, roomId, guestName }, secret)

    const origin = new URL(request.url).origin
    const guestLink = `${origin}/call/join/${roomId}?token=${encodeURIComponent(token)}`

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

    return jsonOk({ guestLink, expiresAt })
  } catch (err) {
    logger.error('[guest-link] generation failed', err)
    return internalError()
  }
}
