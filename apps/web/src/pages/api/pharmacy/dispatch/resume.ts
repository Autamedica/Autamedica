import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAstroAdminClient } from '@/lib/supabase'
import { badRequest, internalError, jsonOk, serviceUnavailable, unauthorized } from '@/lib/api-helpers'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import {
  GUEST_QUEUE_RECOVERY_DAYS,
  verifyGuestQueueRecoveryToken,
} from '@/lib/pharmacy/guest-queue-recovery'
import { logger } from '@autamedica/shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Restore an anonymous on-demand queue on the SAME authorized device.
 * Device sends the 256-bit recovery token in the request BODY only.
 * Every successful resume rotates the short-lived room-bound guest JWT.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null)
    const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : ''
    const recoveryToken = typeof body?.recoveryToken === 'string' ? body.recoveryToken.trim() : ''
    if (!UUID.test(requestId)) return badRequest('invalid_request_id')
    if (!/^[0-9a-f]{64}$/.test(recoveryToken)) return unauthorized('guest_recovery_invalid')

    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) return serviceUnavailable('guest_token_not_configured')

    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const { data: session, error: readError } = await admin
      .from('pharmacy_guest_dispatch_sessions')
      .select('request_id,token_sha256,expires_at,revoked_at')
      .eq('request_id', requestId)
      .maybeSingle()

    if (readError || !session ||
      new Date(session.expires_at as string).getTime() <= Date.now() ||
      !await verifyGuestQueueRecoveryToken(recoveryToken, session.token_sha256 as string)) {
      return unauthorized('guest_recovery_invalid')
    }

    const { data: activeRequest, error: requestError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id,cloudflare_room_id,patient_name,patient_dni,patient_cpf,patient_phone,tier_requested,symptom_summary,status,created_at,search_started_at,search_timeout_at,care_country,assigned_doctor_id,referral_partner_id,requested_by_user_id')
      .eq('id', requestId)
      .maybeSingle()

    if (requestError) {
      logger.error('[api/pharmacy/dispatch/resume] request_read_failed', { code: requestError.code ?? 'INTERNAL' })
      return internalError('guest_recovery_unavailable')
    }
    if (!activeRequest || !['pending_payment', 'searching', 'matched', 'in_call', 'expired', 'completed'].includes(String(activeRequest.status))) {
      return unauthorized('guest_recovery_invalid')
    }
    // Legacy completed requests had their credential revoked by the older
    // trigger. Allow a valid unexpired device secret only for completed
    // encounters so patients can still retrieve the signed documents.
    if (session.revoked_at && !['completed', 'pending_payment', 'expired'].includes(String(activeRequest.status))) {
      return unauthorized('guest_recovery_invalid')
    }

    // An authenticated mobile recovery token is not sufficient on its own.
    // The user must still hold a valid Supabase session owning this request.
    if (activeRequest.requested_by_user_id) {
      const authorization = request.headers.get('authorization')?.trim() ?? ''
      const bearer = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(authorization)
      if (!bearer) return unauthorized('guest_recovery_invalid')
      const { data: identity, error: identityError } = await admin.auth.getUser(bearer[1])
      if (identityError || identity.user?.id !== activeRequest.requested_by_user_id) {
        return unauthorized('guest_recovery_invalid')
      }
    }

    const accessToken = await signGuestToken({
      callId: activeRequest.id as string,
      roomId: activeRequest.cloudflare_room_id as string,
      guestName: ((activeRequest.patient_name as string | null)?.trim() || 'Paciente Farmacia'),
    }, secret)

    // Active queues roll their 30-day recovery window. Completed encounters
    // keep the original expiry so document recovery cannot be extended forever.
    const now = new Date()
    const expiresAt = activeRequest.status === 'completed'
      ? new Date(session.expires_at as string)
      : new Date(now.getTime() + GUEST_QUEUE_RECOVERY_DAYS * 86400_000)
    const { error: writeError } = await admin
      .from('pharmacy_guest_dispatch_sessions')
      .update({ last_used_at: now.toISOString(), expires_at: expiresAt.toISOString(), revoked_at: null })
      .eq('request_id', requestId)
      .eq('token_sha256', session.token_sha256)

    if (writeError) {
      logger.error('[api/pharmacy/dispatch/resume] recovery_refresh_failed', { code: writeError.code ?? 'INTERNAL' })
      return serviceUnavailable('guest_recovery_unavailable')
    }

    return jsonOk({ request: activeRequest, accessToken })
  } catch {
    logger.error('[api/pharmacy/dispatch/resume] unexpected_failure')
    return internalError('guest_recovery_unavailable')
  }
}
