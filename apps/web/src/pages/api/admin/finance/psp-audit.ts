import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { isAuthed, withAuthRole } from '@/lib/api-auth'
import { internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { classifyPspEvidence, type LocalPspPayment, type PspPaymentEvidence } from '@/lib/payments/psp-reconciliation'

type BucketName = 'missing_reference' | 'invalid_reference' | 'psp_consistent' | 'psp_mismatch' | 'psp_pending' | 'provider_unavailable'
type Counter = { total: number; byBucket: Record<BucketName, number> }
const makeCounter = (): Counter => ({
  total: 0,
  byBucket: { missing_reference: 0, invalid_reference: 0, psp_consistent: 0, psp_mismatch: 0, psp_pending: 0, provider_unavailable: 0 },
})

const numericProviderId = /^\d{5,20}$/

/**
 * Privileged read-only audit. Queries the PSP using the existing server-side token.
 * Never rewrites payment statuses or includes patient/appointment IDs in its response.
 * Provider confirmation is NOT bank settlement.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ['platform_admin'], locals)
  if (!isAuthed(auth)) return auth

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const { data, error } = await admin
      .from('appointment_payments')
      .select('appointment_id,patient_id,provider_payment_id,provider,currency,gross_amount,status')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error

    const token = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined)
      ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
      ?? import.meta.env?.MERCADOPAGO_ACCESS_TOKEN

    const byCurrency: Record<string, Counter> = { BRL: makeCounter(), ARS: makeCounter() }
    const payments = (data ?? []) as LocalPspPayment[]

    async function check(local: LocalPspPayment): Promise<{ currency: string; bucket: BucketName }> {
      if (!local.provider_payment_id) return { currency: local.currency, bucket: 'missing_reference' }
      if (local.provider !== 'mercadopago' || !numericProviderId.test(local.provider_payment_id)) {
        return { currency: local.currency, bucket: 'invalid_reference' }
      }
      if (!token) return { currency: local.currency, bucket: 'provider_unavailable' }

      try {
        const response = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(local.provider_payment_id), {
          headers: { Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(6000),
        })
        if (!response.ok) return { currency: local.currency, bucket: 'provider_unavailable' }
        const psp = (await response.json()) as PspPaymentEvidence
        return { currency: local.currency, bucket: classifyPspEvidence(local, psp) }
      } catch {
        return { currency: local.currency, bucket: 'provider_unavailable' }
      }
    }

    // Bound outbound calls to three at a time to avoid rate limit or long response.
    for (let index = 0; index < payments.length; index += 3) {
      const batch = await Promise.all(payments.slice(index, index + 3).map(check))
      for (const item of batch) {
        // Unknown currencies are not silently converted to ARS or BRL.
        const counter = byCurrency[item.currency] ?? (byCurrency[item.currency] = makeCounter())
        counter.total += 1
        counter.byBucket[item.bucket] += 1
      }
    }

    const response = jsonOk({
      byCurrency,
      auditedRecords: payments.length,
      truncatedAt50: payments.length === 50,
      source: 'appointment_payments_vs_mercadopago_api',
      bankSettled: false,
      message: 'Provider status matches are not bank settlement; missing or invalid references require manual audit.',
    })
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch (error) {
    logger.error('[finance/psp-audit] read-only check failed', error)
    return internalError('psp_audit_unavailable')
  }
}
