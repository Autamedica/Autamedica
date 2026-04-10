import type { APIRoute } from 'astro'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import { profileService } from '@/lib/patients/services/profile.service'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

export const PATCH: APIRoute = async ({ request }) => {
  const userId = await getUserIdFromRequest(request)
  if (!userId) return unauthorized()

  const body = await request.json().catch(() => ({})) as {
    profile?: Record<string, unknown>
    patient?: Record<string, unknown>
  }

  try {
    const result = await profileService.update(createAstroAdminClient(locals.runtime?.env), userId, {
      profile: body.profile,
      patient: body.patient,
    })
    return jsonOk(result)
  } catch (e) {
    if (e instanceof Error && (e as NodeJS.ErrnoException & { code?: string }).code === 'PROFILE_UPDATE_FAILED') {
      return badRequest(e.message)
    }
    logger.error('[profile/PATCH]', e)
    return internalError()
  }
}
