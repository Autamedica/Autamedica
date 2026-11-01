import { majorUnitToCents } from '@/lib/payments/money'

export interface LocalPspPayment {
  appointment_id: string
  patient_id: string
  provider_payment_id: string | null
  provider: string
  currency: string
  gross_amount: number
  status: string
}

export interface PspPaymentEvidence {
  id: number | string
  status: string
  status_detail?: string | null
  transaction_amount_refunded?: number | string | null
  currency_id: string
  transaction_amount: number
  external_reference?: string | null
  metadata?: {
    patient_id?: string | null
    appointment_id?: string | null
  } | null
}

export function classifyPspEvidence(
  local: LocalPspPayment,
  psp: PspPaymentEvidence,
): 'psp_consistent' | 'psp_mismatch' | 'psp_pending' {
  if (local.provider !== 'mercadopago' || !local.provider_payment_id) return 'psp_mismatch'
  if (String(psp.id) !== local.provider_payment_id) return 'psp_mismatch'
  if (psp.currency_id !== local.currency || majorUnitToCents(psp.transaction_amount) !== local.gross_amount) return 'psp_mismatch'
  if (
    psp.external_reference !== local.appointment_id &&
    psp.external_reference !== 'apt:' + local.appointment_id
  ) return 'psp_mismatch'
  if (psp.metadata?.patient_id && psp.metadata.patient_id !== local.patient_id) return 'psp_mismatch'
  if (psp.metadata?.appointment_id && psp.metadata.appointment_id !== local.appointment_id) return 'psp_mismatch'
  // A partially refunded `approved` payment is not a consistent full-value sale.
  const refundedMinor = majorUnitToCents(Number(psp.transaction_amount_refunded ?? 0))
  if (psp.status_detail === 'partially_refunded' || (refundedMinor > 0 && refundedMinor < local.gross_amount)) return 'psp_mismatch'
  if (refundedMinor >= local.gross_amount && local.status !== 'refunded') return 'psp_mismatch'
  const normalized = psp.status === 'canceled' ? 'cancelled' : psp.status
  if (normalized === 'pending' || normalized === 'in_process') return 'psp_pending'
  return local.status === normalized ? 'psp_consistent' : 'psp_mismatch'
}
