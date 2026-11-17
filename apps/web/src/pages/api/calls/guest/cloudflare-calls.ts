import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleRoomBoundCloudflareProxy } from '@/lib/calls/sfu-room-binding'
import { unauthorized, internalError } from '@/lib/api-helpers'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret, resolveCloudflareCallsEnv } from '@/lib/runtime-env'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { checkJordanMediaAccess } from '@/lib/pharmacy/payments/jordan-media-access'
import { verifyGuestDispatchAccess } from '@/lib/calls/lib/guest-dispatch-access'

export const POST: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) return unauthorized()

  const secret = resolveGuestSecret(locals.runtime?.env)
  if (!secret) {
    logger.error('[guest/cloudflare-calls] GUEST_TOKEN_SECRET not configured')
    return internalError()
  }

  const guest = await verifyGuestToken(token, secret)
  if (!guest) return unauthorized()

  // A guest token authenticates only the signed room and call, not arbitrary
  // Cloudflare sessions. Reject client-forged room IDs before touching the SFU.
  const payload = await request.clone().json().catch(() => null)
  if (typeof payload?.roomId !== 'string' || payload.roomId !== guest.roomId) {
    return new Response(JSON.stringify({ error: 'call_access_denied' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Every SFU operation rechecks room ownership and persisted payment.
  let admin: SupabaseClient
  try {
    admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const dispatchAccess = await verifyGuestDispatchAccess(admin, guest)
    if (dispatchAccess.kind === 'forbidden') {
      return new Response(JSON.stringify({ error: 'call_access_denied' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      })
    }
    if (dispatchAccess.kind === 'conflict') {
      return new Response(JSON.stringify({ error: dispatchAccess.message }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      })
    }
    if (await checkJordanMediaAccess(admin as unknown as SupabaseClient, guest.roomId) !== 'allowed') {
      return new Response(JSON.stringify({ error: 'brazil_pharmacy_payment_required' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    logger.error('[guest/cloudflare-calls] Could not authorize Brazil pharmacy media', error)
    return internalError('jordan_media_gate_unavailable')
  }

  const { appId, appSecret } = resolveCloudflareCallsEnv(locals.runtime?.env)
  const enabled = (locals.runtime?.env?.SFU_SESSION_BINDINGS_ENABLED as string | undefined)
    ?? import.meta.env.SFU_SESSION_BINDINGS_ENABLED
  const result = await handleRoomBoundCloudflareProxy(
    request, admin, guest.roomId, `guest:${guest.callId}`,
    { appId, appSecret, bindingsEnabled: enabled === 'true' },
  )

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  })
}
