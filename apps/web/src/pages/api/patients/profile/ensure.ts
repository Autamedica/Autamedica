import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import { logger } from '@autamedica/shared'
import { profileService } from '@/lib/patients/services/profile.service'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request }) => {
  const userId = await getUserIdFromRequest(request)
  if (!userId) return unauthorized()

  const body = await request.json().catch(() => ({})) as { email?: unknown }
  const email = typeof body.email === 'string' ? body.email : null

  try {
    await profileService.ensure(createAstroAdminClient(locals.runtime?.env), userId, email)
    return jsonOk(null)
  } catch (e) {
    logger.error('[profile/ensure/POST]', e)
    if (e instanceof Error && e.message.includes('profiles')) return badRequest('profiles_failed')
    return internalError()
  }
}
