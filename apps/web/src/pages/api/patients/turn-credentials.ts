import type { APIRoute } from 'astro'
import { handleTurnCredentials } from '@autamedica/telemedicine/server'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { unauthorized } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request }) => {
  const context = await resolvePatientContext(request)
  if (!context) {
    return unauthorized()
  }

  const result = await handleTurnCredentials({
    keyId: import.meta.env.CLOUDFLARE_CALLS_TURN_KEY_ID,
    token: import.meta.env.CLOUDFLARE_CALLS_TURN_TOKEN,
  })
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers,
  })
}
