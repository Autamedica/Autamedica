import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
type RefundActor = { ok: boolean; userId?: string; role?: string }
async function assertAdmin(request: Request, admin: ReturnType<typeof createAstroAdminClient>, locals?: any): Promise<RefundActor> {
  if (locals?.session?.user) {
    const userId = locals.session.user.id
    const { data: profile } = await admin.from('profiles').select('role').eq('user_id', userId).maybeSingle()
    if (profile?.role && ['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) return { ok: true, userId, role: profile.role }
  }
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return { ok: false }
  const { data: profile } = await admin.from('profiles').select('role').eq('user_id', data.user.id).maybeSingle()
  if (!profile?.role || !['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) return { ok: false }
  return { ok: true, userId: data.user.id, role: profile.role }
}
export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env) as any
  const auth = await assertAdmin(request, admin, locals)
  if (!auth.ok || !auth.userId || !auth.role) return unauthorized('admin role required')
  try {
    const body = await request.json().catch(() => null)
    const paymentId = typeof body?.paymentId === 'string' ? body.paymentId : ''
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (!paymentId) return badRequest('paymentId is required')
    if (!reason) return badRequest('reason for refund is required')
    const { data: payment, error: fetchError } = await admin.from('appointment_payments').select('*').eq('id', paymentId).maybeSingle()
    if (fetchError || !payment) return badRequest('appointment payment not found')
    if (payment.status !== 'approved') return badRequest(`cannot refund payment in '${payment.status}' status`)
    const providerPaymentId = payment.provider_payment_id ?? (payment.metadata as Record<string, unknown> | null)?.provider_payment_id
    if (!providerPaymentId) return badRequest('mercadopago_payment_id_missing')
    if (auth.role === 'organization_admin') {
      const { data: decision, error } = await admin.from('admin_approval_decisions').insert({
        domain: 'money', status: 'PENDING_HUMAN_APPROVAL', proposed_by: `organization_admin:${auth.userId}`,
        summary: `Refund requested for appointment payment ${paymentId}`, risk_reason: reason.slice(0, 2000),
        impact_scope: `MercadoPago payment ${providerPaymentId}; appointment payment ${paymentId}`,
        payload: { action: 'mercadopago_refund', paymentId, providerPaymentId: String(providerPaymentId), reason },
      }).select('id').single()
      if (error || !decision) throw error ?? new Error('refund_approval_creation_failed')
      return jsonOk({ success: true, approvalRequired: true, decisionId: decision.id }, 202)
    }
    const token = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined) ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
    if (!token) return internalError('mercadopago_access_not_configured')
    const providerResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(providerPaymentId))}/refunds`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `autamedica-refund-${paymentId}` }, body: JSON.stringify({}),
    })
    if (!providerResponse.ok) {
      logger.error('[api/admin/finance/refunds] MercadoPago refund rejected', { status: providerResponse.status, paymentId })
      return internalError('mercadopago_refund_failed')
    }
    const providerResult = await providerResponse.json().catch(() => ({}))
    const metadata = { ...((payment.metadata as Record<string, unknown> | null) ?? {}), refund_reason: reason,
      refunded_by: auth.userId, refunded_at: new Date().toISOString(), refund_provider: 'mercadopago', refund_provider_result: providerResult }
    const { error: updateError } = await admin.from('appointment_payments').update({ status: 'refunded', metadata }).eq('id', paymentId).eq('status', 'approved')
    if (updateError) throw updateError
    const { data: earning } = await admin.from('doctor_earnings').select('id, metadata').eq('appointment_payment_id', paymentId).maybeSingle()
    if (earning) {
      const { error } = await admin.from('doctor_earnings').update({ status: 'cancelled',
        metadata: { ...((earning.metadata as Record<string, unknown> | null) ?? {}), cancelled_reason: `refunded: ${reason}`, cancelled_by: auth.userId } }).eq('id', earning.id)
      if (error) throw error
    }
    return jsonOk({ success: true, message: 'MercadoPago refund completed and doctor earnings cancelled.' })
  } catch (error) {
    logger.error('[api/admin/finance/refunds] POST failed', error)
    return internalError('failed to refund transaction')
  }
}
