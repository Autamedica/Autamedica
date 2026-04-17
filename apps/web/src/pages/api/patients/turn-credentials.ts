import type { APIRoute } from 'astro'
import { handleTurnCredentials } from '@autamedica/telemedicine/server'
import { unauthorized } from '@/lib/api-helpers'
import { resolveCloudflareCallsEnv } from '@/lib/runtime-env'

export const GET: APIRoute = async ({ locals }) => {
  // Use session from middleware (already validated via getUser() + refreshed if needed)
  if (!locals.session) return unauthorized()

  const { turnKeyId, turnToken } = resolveCloudflareCallsEnv(locals.runtime?.env)
  const result = await handleTurnCredentials({
    keyId: turnKeyId,
    token: turnToken,
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  })
}
