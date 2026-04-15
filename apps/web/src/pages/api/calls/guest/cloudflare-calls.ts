import type { APIRoute } from 'astro'
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'
import { unauthorized, internalError } from '@/lib/api-helpers'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { getRuntimeEnvValue, resolveCloudflareCallsEnv } from '@/lib/runtime-env'
import { logger } from '@autamedica/shared'

function resolveGuestSecret(runtimeEnv?: Record<string, unknown>): string | undefined {
  return getRuntimeEnvValue('GUEST_TOKEN_SECRET')
    ?? (runtimeEnv as Record<string, string> | undefined)?.GUEST_TOKEN_SECRET
    ?? import.meta.env.GUEST_TOKEN_SECRET
    ?? undefined
}

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
