import type { APIRoute } from 'astro'
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'
import { unauthorized, internalError, forbidden, conflict } from '@/lib/api-helpers'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret, resolveCloudflareCallsEnv } from '@/lib/runtime-env'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
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

  // Validate the server-confirmed clinical and commercial authorization on
  // EVERY media proxy request, not only on the Kotlin screen or bootstrap.
  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const access = await verifyGuestDispatchAccess(admin, guest)
    if (access.kind === 'forbidden') return forbidden('call_access_denied')
    if (access.kind === 'conflict') return conflict(access.message)
  } catch {
    logger.error('[guest/cloudflare-calls] dispatch authorization unavailable')
    return internalError()
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
