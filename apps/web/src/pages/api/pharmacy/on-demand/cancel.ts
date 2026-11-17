import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { verifyGuestToken } from '@/lib/calls/lib/guest-token'
import { resolveGuestSecret } from '@/lib/runtime-env'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * POST /api/pharmacy/on-demand/cancel
 *
 * The public pharmacy kiosk uses Gen-2 pharmacy_dispatch_requests.
 * A UUID is an identifier, never authorization. Only the authenticated owner
 * or a valid, room-bound guest token can cancel a still-searching request.
 * No service-role update is attempted before identity is checked.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null)
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : ''
    const guestToken = typeof body?.accessToken === 'string' ? body.accessToken.trim() : ''

    if (!UUID_REGEX.test(requestId)) return badRequest('invalid_request_id')

    const admin = createAstroAdminClient(locals.runtime?.env)
    const { data: existing, error: readError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id, cloudflare_room_id, requested_by_user_id, status, search_started_at, created_at')
      .eq('id', requestId)
      .maybeSingle()

    // A missing request and an unauthorized request must not reveal identifiers.
    if (readError || !existing) return unauthorized('request_not_authorized')

    const sessionUser = (locals as { user?: { id: string } }).user ?? locals.session?.user
    const ownerAuthorized = Boolean(
      sessionUser?.id && existing.requested_by_user_id && sessionUser.id === existing.requested_by_user_id,
    )

    let guestAuthorized = false
    if (!ownerAuthorized && guestToken) {
      const secret = resolveGuestSecret(locals.runtime?.env)
      if (secret) {
        const payload = await verifyGuestToken(guestToken, secret)
        guestAuthorized = existing.requested_by_user_id === null &&
          payload?.callId === existing.id &&
          payload?.roomId === existing.cloudflare_room_id
      }
    }

    if (!ownerAuthorized && !guestAuthorized) return unauthorized('request_not_authorized')

    // A patient can cancel only after the local 15-minute search has elapsed
    // and the current 30-second physician offer is no longer pending.
    const searchStartedAt = new Date(existing.search_started_at ?? existing.created_at).getTime()
    if (!['searching', 'expired'].includes(String(existing.status))
      || !Number.isFinite(searchStartedAt)
      || Date.now() < searchStartedAt + 15 * 60 * 1000) {
      return jsonOk({ cancelled: false, code: 'WAIT_WINDOW_NOT_REACHED' })
    }
    const { data: activeOffer, error: offerError } = await admin
      .from('dispatch_offers')
      .select('id')
      .eq('dispatch_request_id', requestId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (offerError) return internalError('cancel_failed')
    if (activeOffer) return jsonOk({ cancelled: false, code: 'DOCTOR_OFFER_STILL_ACTIVE' })

    const { data: updated, error: updateError } = await admin
      .from('pharmacy_dispatch_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .is('requested_by_user_id', null)
      .in('status', ['searching', 'expired'])
      .select('id')
      .maybeSingle()

    if (updateError) {
      logger.error('[api/pharmacy/on-demand/cancel] update_failed', { code: updateError.code ?? 'UNKNOWN' })
      return internalError('cancel_failed')
    }

    return jsonOk({ cancelled: Boolean(updated?.id) })
  } catch {
    logger.error('[api/pharmacy/on-demand/cancel] unexpected_failure')
    return internalError('cancel_failed')
  }
}
