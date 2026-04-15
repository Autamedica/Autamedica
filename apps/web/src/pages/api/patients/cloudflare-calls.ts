import type { APIRoute } from 'astro'
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'
import { unauthorized } from '@/lib/api-helpers'
import { resolveCloudflareCallsEnv } from '@/lib/runtime-env'

export const POST: APIRoute = async ({ request, locals }) => {
  // Use session from middleware (already validated via getUser() + refreshed if needed)
  if (!locals.session) return unauthorized()

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
