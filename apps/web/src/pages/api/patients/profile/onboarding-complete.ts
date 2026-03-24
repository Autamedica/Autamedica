import type { APIRoute } from 'astro'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { jsonOk, unauthorized, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return unauthorized()
    }

    const admin = createAdminClient()

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        onboarding_completed_at: new Date().toISOString(),
        onboarding_started_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    if (profileError) {
      logger.error('[API] onboarding-complete profile update failed', profileError)
    }

    // Also set onboarding_completed in user_metadata for fast middleware checks
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { onboarding_completed: true },
    })

    if (authError) {
      logger.error('[API] onboarding-complete user_metadata update failed', authError)
    }

    return jsonOk(null)
  } catch (err) {
    logger.error('[API] onboarding-complete error', err as Error)
    return internalError()
  }
}
