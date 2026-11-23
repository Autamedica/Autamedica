import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAstroAdminClient } from '@/lib/supabase'
import { internalError, jsonOk, notFound, serviceUnavailable } from '@/lib/api-helpers'
import { resolveGuestSecret } from '@/lib/runtime-env'
import { signGuestToken } from '@/lib/calls/lib/guest-token'
import { createGuestQueueRecoveryToken, hashGuestQueueRecoveryToken } from '@/lib/pharmacy/guest-queue-recovery'
import { logger } from '@autamedica/shared'

const NOT_FOUND = 'No encontramos una consulta paga activa con esos datos'
const NOT_FOUND_PT = 'N\u00E3o encontramos um atendimento pago ativo com esses dados'
const ACTIVE_STATUSES = ['searching', 'assigned', 'matched', 'in_call', 'paid', 'pending_payment']

const digits = (value: unknown) => typeof value === 'string' ? value.replace(/\D/g, '') : ''

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return notFound(NOT_FOUND)
    const document = digits(body.document)
    const phone = digits(body.phone)
    if (document.length < 5 || document.length > 14 || phone.length < 6 || phone.length > 15) return notFound(NOT_FOUND)

    const secret = resolveGuestSecret(locals.runtime?.env)
    if (!secret) return serviceUnavailable('guest_token_not_configured')

    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: candidates, error: requestError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id,status,created_at,patient_dni,patient_cpf,patient_phone,patient_name,cloudflare_room_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .or('patient_dni.eq.' + document + ',patient_cpf.eq.' + document)

    if (requestError) {
      logger.error('[api/pharmacy/dispatch/recover-queue] request_lookup_failed', { code: requestError.code ?? 'INTERNAL' })
      return internalError('queue_recovery_unavailable')
    }

    const match = (candidates ?? []).find((row) =>
      ACTIVE_STATUSES.includes(String(row.status))
      && (digits(row.patient_dni) === document || digits(row.patient_cpf) === document)
      && digits(row.patient_phone) === phone
      && Date.now() - new Date(row.created_at).getTime() <= 24 * 60 * 60 * 1000,
    )
    if (!match) return notFound(request.headers.get('accept-language')?.toLowerCase().startsWith('pt') ? NOT_FOUND_PT : NOT_FOUND)

    const { data: payment, error: paymentError } = await admin
      .from('pharmacy_dispatch_payments')
      .select('status')
      .eq('dispatch_request_id', match.id)
      .maybeSingle()
    if (paymentError) {
      logger.error('[api/pharmacy/dispatch/recover-queue] payment_lookup_failed', { code: paymentError.code ?? 'INTERNAL' })
      return internalError('queue_recovery_unavailable')
    }
    if (payment?.status !== 'approved') return notFound(request.headers.get('accept-language')?.toLowerCase().startsWith('pt') ? NOT_FOUND_PT : NOT_FOUND)

    const { data: session, error: sessionReadError } = await admin
      .from('pharmacy_guest_dispatch_sessions')
      .select('request_id')
      .eq('request_id', match.id)
      .maybeSingle()
    if (sessionReadError) {
      logger.error('[api/pharmacy/dispatch/recover-queue] session_lookup_failed', { code: sessionReadError.code ?? 'INTERNAL' })
      return internalError('queue_recovery_unavailable')
    }

    // Persist only the SHA-256 digest, preserving request.ts token format
    // and its 30-day recovery lifetime.
    const recoveryToken = createGuestQueueRecoveryToken()
    const tokenHash = await hashGuestQueueRecoveryToken(recoveryToken)
    const sessionValues = {
      token_sha256: tokenHash,
      last_used_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      revoked_at: null,
    }

    let sessionWriteError: { code?: string } | null = null
    if (session) {
      const { error } = await admin.from('pharmacy_guest_dispatch_sessions').update(sessionValues).eq('request_id', match.id)
      sessionWriteError = error
    } else {
      const { error } = await admin.from('pharmacy_guest_dispatch_sessions').insert({ request_id: match.id, ...sessionValues })
      sessionWriteError = error
      // A concurrent recovery may insert the unique row after our read.
      if (sessionWriteError?.code === '23505') {
        const { error: retryError } = await admin.from('pharmacy_guest_dispatch_sessions').update(sessionValues).eq('request_id', match.id)
        sessionWriteError = retryError
      }
    }

    if (sessionWriteError) {
      logger.error('[api/pharmacy/dispatch/recover-queue] session_persist_failed', { code: sessionWriteError.code ?? 'INTERNAL' })
      return internalError('queue_recovery_unavailable')
    }

    const guestToken = await signGuestToken({
      callId: match.id,
      roomId: match.cloudflare_room_id,
      guestName: match.patient_name?.trim() || 'Paciente Farmacia',
    }, secret)

    return jsonOk({ requestId: match.id, status: match.status, guestToken, recoveryToken })
  } catch {
    logger.error('[api/pharmacy/dispatch/recover-queue] unexpected_failure')
    return internalError('queue_recovery_unavailable')
  }
}
