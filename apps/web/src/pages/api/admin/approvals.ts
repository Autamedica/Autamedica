import type { APIRoute } from 'astro'
import { withAuthRole, isAuthed } from '@/lib/api-auth'
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { getRuntimeEnvValue } from '@/lib/runtime-env'
export const prerender = false
export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ['admin', 'platform_admin'], locals)
  if (!isAuthed(auth)) return auth
  const status = new URL(request.url).searchParams.get('status')
  const db = createAstroAdminClient(locals.runtime?.env) as any
  let query = db.from('admin_approval_decisions').select('*').order('created_at', { ascending: false }).limit(200)
  if (status === 'pending') query = query.eq('status', 'PENDING_HUMAN_APPROVAL')
  const { data, error } = await query
  if (error) return internalError('approval_inbox_unavailable')
  return jsonOk(data ?? [])
}
async function executeApprovedAction(db: any, payload: Record<string, unknown>, locals: any, resolutionAction?: string): Promise<void> {
  if (payload.action_type === 'expired_paid_dispatch') {
    const requestId = typeof payload.dispatch_request_id === 'string' ? payload.dispatch_request_id : ''
    const paymentId = typeof payload.payment_id === 'string' ? payload.payment_id : ''
    if (!requestId || !paymentId || !['reopen', 'refund'].includes(resolutionAction ?? '')) throw new Error('expired_dispatch_resolution_required')
    const { data: payment, error: paymentError } = await db.from('pharmacy_dispatch_payments')
      .select('id, status, provider_payment_id, amount_minor').eq('id', paymentId).eq('dispatch_request_id', requestId).maybeSingle()
    if (paymentError) throw paymentError
    if (!payment) throw new Error('expired_dispatch_payment_not_found')
    if (resolutionAction === 'reopen') {
      const { data: request, error: requestError } = await db.from('pharmacy_dispatch_requests')
        .update({ status: 'searching', search_timeout_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() })
        .eq('id', requestId).eq('status', 'expired').select('id').maybeSingle()
      if (requestError) throw requestError
      if (!request) throw new Error('expired_dispatch_request_not_reopenable')
      const { data: matched, error: matchError } = await db.rpc('match_dispatch_doctors', { p_dispatch_id: requestId })
      if (matchError) throw matchError
      if (matched?.code === 'DISPATCH_ENGINE_DISABLED') throw new Error('dispatch_engine_disabled')
      return
    }
    if (payment.status === 'refunded') return
    if (payment.status !== 'approved') throw new Error('expired_dispatch_payment_not_approved')
    if (!payment.provider_payment_id) throw new Error('expired_dispatch_mp_payment_id_missing')
    const token = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined) ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
    if (!token) throw new Error('mercadopago_access_not_configured')
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(payment.provider_payment_id))}/refunds`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `autamedica-expired-dispatch-refund-${requestId}` },
      body: JSON.stringify({ amount: Number(payment.amount_minor) / 100 }),
    })
    if (!response.ok) throw new Error(`mercadopago_refund_failed_${response.status}`)
    const refundResult = await response.json().catch(() => ({}))
    const { error: refundUpdateError } = await db.from('pharmacy_dispatch_payments')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('id', paymentId).eq('status', 'approved')
    if (refundUpdateError) throw refundUpdateError
    return
  }
  if (!payload.action) return
  if (payload.action === 'growth_agent_job') {
    const jobId = typeof payload.jobId === 'string' ? payload.jobId : ''
    if (!jobId) throw new Error('approval_growth_job_id_missing')
    const { data, error } = await db.schema('growth_os').from('agent_jobs')
      .update({ status: 'ready', next_run_at: new Date().toISOString() })
      .eq('id', jobId).eq('status', 'blocked').select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new Error('approval_growth_job_not_releasable')
    return
  }
  if (payload.action === 'mercadopago_refund') {
    const paymentId = typeof payload.paymentId === 'string' ? payload.paymentId : ''
    if (!paymentId) throw new Error('approval_refund_payment_id_missing')
    const { data: payment, error } = await db.from('appointment_payments').select('*').eq('id', paymentId).maybeSingle()
    if (error) throw error
    if (!payment) throw new Error('approval_refund_payment_not_found')
    if (payment.status === 'refunded') return
    if (payment.status !== 'approved') throw new Error('approval_refund_payment_not_approved')
    const providerPaymentId = payment.provider_payment_id ?? (payment.metadata as Record<string, unknown> | null)?.provider_payment_id ?? payload.providerPaymentId
    if (!providerPaymentId) throw new Error('approval_refund_provider_payment_id_missing')
    const token = (locals.runtime?.env?.MERCADOPAGO_ACCESS_TOKEN as string | undefined) ?? getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN')
    if (!token) throw new Error('mercadopago_access_not_configured')
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(providerPaymentId))}/refunds`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': `autamedica-refund-${paymentId}` }, body: JSON.stringify({}),
    })
    if (!response.ok) throw new Error(`mercadopago_refund_failed_${response.status}`)
    const result = await response.json().catch(() => ({}))
    const metadata = { ...((payment.metadata as Record<string, unknown> | null) ?? {}), refund_reason: String(payload.reason ?? 'Approved by platform admin'),
      refunded_at: new Date().toISOString(), refund_provider: 'mercadopago', refund_provider_result: result }
    const { error: updateError } = await db.from('appointment_payments').update({ status: 'refunded', metadata }).eq('id', paymentId).eq('status', 'approved')
    if (updateError) throw updateError
    const { data: earning } = await db.from('doctor_earnings').select('id, metadata').eq('appointment_payment_id', paymentId).maybeSingle()
    if (earning) {
      const { error: earningError } = await db.from('doctor_earnings').update({ status: 'cancelled',
        metadata: { ...((earning.metadata as Record<string, unknown> | null) ?? {}), cancelled_reason: 'refunded by MercadoPago approval' } }).eq('id', earning.id)
      if (earningError) throw earningError
    }
    return
  }
  throw new Error('approval_action_not_supported')
}
export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ['admin', 'platform_admin'], locals)
  if (!isAuthed(auth)) return auth
  const body = await request.json().catch(() => null) as { id?: string; decision?: string; notes?: string; resolution_action?: string } | null
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
  if (!body?.id || !['APPROVED', 'REJECTED'].includes(body.decision ?? '') || !notes) return badRequest('approval_id_decision_and_review_notes_required')
  const db = createAstroAdminClient(locals.runtime?.env) as any
  const { data: decision, error: lookupError } = await db.from('admin_approval_decisions').select('*').eq('id', body.id).eq('status', 'PENDING_HUMAN_APPROVAL').maybeSingle()
  if (lookupError) return internalError('approval_decision_lookup_failed')
  if (!decision) return badRequest('approval_already_reviewed_or_not_found')
  const payload = decision.payload && typeof decision.payload === 'object' ? decision.payload as Record<string, unknown> : {}
  try {
    if (body.decision === 'APPROVED') await executeApprovedAction(db, payload, locals, body.resolution_action)
    else if (payload.action === 'growth_agent_job' && typeof payload.jobId === 'string') {
      const { error } = await db.schema('growth_os').from('agent_jobs').update({ status: 'cancelled' }).eq('id', payload.jobId).eq('status', 'blocked')
      if (error) throw error
    } else if (payload.action === 'mercadopago_refund' && typeof payload.paymentId === 'string') {
      const { data: payment, error } = await db.from('appointment_payments').select('id, metadata').eq('id', payload.paymentId).maybeSingle()
      if (error) throw error
      if (payment) {
        const { error: updateError } = await db.from('appointment_payments').update({
          metadata: { ...((payment.metadata as Record<string, unknown> | null) ?? {}), refund_review_status: 'rejected', refund_review_notes: notes },
        }).eq('id', payment.id)
        if (updateError) throw updateError
      }
    }
  } catch (error) { return internalError(error instanceof Error ? error.message : 'approval_action_execution_failed') }
  const now = new Date().toISOString()
  const { data, error } = await db.from('admin_approval_decisions').update({
    status: body.decision, reviewed_by: auth.user.id, reviewed_at: now, review_notes: notes.slice(0, 2000), updated_at: now,
  }).eq('id', body.id).eq('status', 'PENDING_HUMAN_APPROVAL').select('*').maybeSingle()
  if (error) return internalError('approval_decision_update_failed')
  if (!data) return badRequest('approval_already_reviewed_or_not_found')
  const { error: auditError } = await db.from('audit_logs').insert({
    user_id: auth.user.id, action: 'admin_approval_decision_reviewed', resource_type: 'admin_approval_decisions',
    resource_id: data.id, metadata: { decision: body.decision, notes: notes.slice(0, 2000), domain: data.domain },
  })
  if (auditError) return internalError('approval_audit_log_failed')
  return jsonOk(data)
}
