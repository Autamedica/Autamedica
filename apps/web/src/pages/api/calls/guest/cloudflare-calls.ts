import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'
import { unauthorized, internalError } from '@/lib/api-helpers'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret, resolveCloudflareCallsEnv } from '@/lib/runtime-env'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { checkJordanMediaAccess } from '@/lib/pharmacy/payments/jordan-media-access'

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

  // Every SFU operation rechecks room ownership and the persisted payment.
  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const { data: dispatch, error: dispatchError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id,status')
      .eq('cloudflare_room_id', guest.roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (dispatchError) throw dispatchError

    if (dispatch) {
      if (dispatch.id !== guest.callId ||
          ['completed','cancelled','canceled','expired'].includes(dispatch.status)) {
        return new Response(JSON.stringify({ error: 'call_access_denied' }), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        })
      }
    } else {
      const { data: call, error: callError } = await admin
        .from('calls')
        .select('id,status')
        .eq('room_id', guest.roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (callError) throw callError
      if (call?.id !== guest.callId ||
          ['ended','declined','canceled','cancelled'].includes(call.status)) {
        return new Response(JSON.stringify({ error: 'call_access_denied' }), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    if (await checkJordanMediaAccess(admin as unknown as SupabaseClient, guest.roomId) !== 'allowed') {
      return new Response(JSON.stringify({ error: 'jordan_payment_required' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    logger.error('[guest/cloudflare-calls] Could not authorize Jordan media', error)
    return internalError('jordan_media_gate_unavailable')
  }

  const { appId, appSecret } = resolveCloudflareCallsEnv(locals.runtime?.env)
  const result = await handleCloudflareCallsProxy(request, {
    appId,
    appSecret,
  })

  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  })
}
