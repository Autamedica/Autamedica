import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { jsonOk, forbidden, internalError } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { createAstroAdminClient } from '@/lib/supabase'
import { telemedicineStatsService } from '@/lib/admin/services/telemedicine-stats.service'

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuth(request)
    if (!isAuthed(auth)) return auth

    const admin = createAstroAdminClient(locals.runtime?.env)

    const isAdmin = await telemedicineStatsService.verifyAdmin(admin, auth.user.id)
    if (!isAdmin) return forbidden()

    const result = await telemedicineStatsService.getStats(admin)
    return jsonOk(result)
  } catch (error) {
    logger.error('[telemedicine-stats] GET error', error)
    return internalError()
  }
}
