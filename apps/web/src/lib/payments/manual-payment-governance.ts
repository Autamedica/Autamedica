export type ManualPilotPaymentCandidate = {
  provider: string
  payment_mode: string | null
  manual_approval_pending: boolean
  status: string
  request_status: string | null
}

/** Admin override eligibility is intentionally broader than provider verification. */
export function isManualPilotApprovalEligible(payment: ManualPilotPaymentCandidate): boolean {
  const payable = ['pending', 'pending_payment'].includes(payment.status)
    && ['pending_payment', 'searching'].includes(payment.request_status ?? '')
  if (!payable) return false
  if (payment.provider === 'mercadopago') return true
  return payment.provider === 'manual'
    && payment.payment_mode === 'manual_pilot'
    && payment.manual_approval_pending === true
}

export function resolveManualApprovalResult<T extends {
  payment_approved?: boolean
  dispatch_result?: { success?: boolean | null } | null
  status?: string
}>(result: T): T & { status?: string; success?: boolean } {
  if (result.payment_approved === true && result.dispatch_result?.success !== true) {
    return { ...result, success: true, status: 'approved_pending_dispatch_resolution' }
  }
  return result
}

export function isSpecificPaymentSwitchReason(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const reason = value.trim()
  const genericReasons = new Set([
    'cambio manual desde admin',
    'cambio manual',
    'actualización',
    'actualizacion',
    'test',
    'prueba',
    'manual',
  ])
  return reason.length >= 12 && reason.length <= 500 && !genericReasons.has(reason.toLowerCase())
}
