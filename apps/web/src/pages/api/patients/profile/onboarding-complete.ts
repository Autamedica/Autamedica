import type { APIRoute } from 'astro'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return json({ ok: false, error: 'unauthorized' }, 401)
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

    return json({ ok: true })
  } catch (err) {
    logger.error('[API] onboarding-complete error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}
