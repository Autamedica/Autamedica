import type { APIRoute } from 'astro'
import { handleTurnCredentials } from '@autamedica/telemedicine/server'
import { unauthorized } from '@/lib/api-helpers'

export const GET: APIRoute = async ({ locals }) => {
  // Use session from middleware (already validated via getUser() + refreshed if needed)
  if (!locals.session) return unauthorized()

  const result = await handleTurnCredentials({
    keyId: import.meta.env.CLOUDFLARE_CALLS_TURN_KEY_ID,
    token: import.meta.env.CLOUDFLARE_CALLS_TURN_TOKEN,
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  })
}
