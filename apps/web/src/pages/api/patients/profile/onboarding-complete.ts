import type { APIRoute } from 'astro'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { profileService } from '@/lib/patients/services/profile.service'
import { jsonOk, unauthorized, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = await getUserIdFromRequest(request)
  if (!userId) return unauthorized()

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    await profileService.completeOnboarding(admin, admin, userId)
    return jsonOk(null)
  } catch (err) {
    logger.error('[profile/onboarding-complete/POST]', err)
    return internalError()
  }
}
