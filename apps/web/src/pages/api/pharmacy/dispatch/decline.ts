import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, internalError, jsonFail, jsonOk } from '@/lib/api-helpers'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth
  const body = await request.json().catch(() => null) as { offerId?: unknown } | null
  if (typeof body?.offerId !== 'string' || !UUID.test(body.offerId)) {
    return badRequest('valid_offer_id_required')
  }
  try {
    const client = auth.supabase as unknown as SupabaseClient
    const { data, error } = await client.rpc('decline_my_pharmacy_dispatch_offer', {
      p_offer_id: body.offerId,
    })
    if (error) {
      logger.error('[api/pharmacy/dispatch/decline] RPC failed', { code: error.code ?? 'INTERNAL' })
      return internalError('dispatch_offer_decline_failed')
    }
    const result = data as { declined?: boolean; code?: string } | null
    if (result?.declined !== true) {
      return jsonFail('CONFLICT', result?.code ?? 'OFFER_NO_LONGER_ACTIVE', 409, result)
    }
    return jsonOk(result)
  } catch (error) {
    logger.error('[api/pharmacy/dispatch/decline] POST failed', error)
    return internalError('dispatch_offer_decline_failed')
  }
}
