import type { APIRoute } from 'astro'
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

  // Every SFU operation must recheck the persisted PSP result: an existing
  // room token or an earlier bootstrap must not bypass payment or refund.
  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    if (await checkJordanMediaAccess(admin, guest.roomId) !== 'allowed') {
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
