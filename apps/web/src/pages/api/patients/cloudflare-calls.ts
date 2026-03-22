import type { APIRoute } from 'astro'
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'

export const POST: APIRoute = async ({ request }) => {
  const result = await handleCloudflareCallsProxy(request, {
    appId: import.meta.env.CLOUDFLARE_CALLS_APP_ID,
    appSecret: import.meta.env.CLOUDFLARE_CALLS_APP_SECRET,
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  })
}
