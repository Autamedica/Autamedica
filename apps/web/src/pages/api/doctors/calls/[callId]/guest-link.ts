import type { APIRoute } from 'astro'
import { logger, BASE_URL_BY_ROLE } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, forbidden, internalError, jsonOk, notFound, serviceUnavailable } from '@/lib/api-helpers'
import { withAuthRole, isAuthed, DOCTOR_ROLES } from '@/lib/api-auth'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret } from '@/lib/runtime-env'

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

    /**
     * OBTENCIÓN DEL LINK FUNCIONAL CORRECTO
     * 1. Prioridad: PUBLIC_SITE_URL (si está definido en el env del runtime)
     * 2. Fallback centralizado: BASE_URL_BY_ROLE['patient'] (que maneja localhost:3002 en dev)
     * 3. Último recurso: El origin del request actual.
     */
    const siteUrl = (locals.runtime?.env?.PUBLIC_SITE_URL as string) || BASE_URL_BY_ROLE['patient']
    const origin = siteUrl ? new URL(siteUrl).origin : new URL(request.url).origin
    
    const guestLink = `${origin}/call/join/${roomId}?token=${encodeURIComponent(token)}`

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    return jsonOk({ guestLink, expiresAt })
  } catch (err) {
    logger.error('[guest-link] generation failed', err)
    return internalError()
  }
}
