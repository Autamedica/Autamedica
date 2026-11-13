import { majorUnitToCents } from '@/lib/payments/money'

/** Pure verification gate: no paid status without exact local ownership and PSP evidence. */
export type PixProviderEvidence = {
  id: string | number
  status: string
  transaction_amount: number
  currency_id: string
  payment_method_id?: string | null
  external_reference?: string | null
  date_approved?: string | null
  metadata?: {
    patient_id?: string | null
    appointment_id?: string | null
    payment_type?: string | null
  } | null
}

export type LocalAppointmentPaymentEvidence = {
  appointment_id: string
  patient_id: string
  provider: string
  provider_payment_id: string | null
  gross_amount: number
  currency: string
  status: string
}

export function isMatchingApprovedPixAppointment(
  provider: PixProviderEvidence,
  local: LocalAppointmentPaymentEvidence | null,
  requestedPaymentId: string,
  authenticatedPatientId: string,
): boolean {
  if (!local || !/^\d{1,20}$/.test(requestedPaymentId)) return false
  if (local.patient_id !== authenticatedPatientId || local.provider !== 'mercadopago') return false
  if (local.provider_payment_id !== requestedPaymentId || String(provider.id) !== requestedPaymentId) return false
  if (local.currency !== 'BRL' || provider.currency_id !== 'BRL' || provider.payment_method_id !== 'pix') return false
  if (local.status !== 'pending' && local.status !== 'approved') return false
  if (provider.status !== 'approved' || !provider.date_approved) return false
  if (majorUnitToCents(provider.transaction_amount) !== local.gross_amount) return false
  if (provider.external_reference !== 'apt:' + local.appointment_id) return false
  if (provider.metadata?.appointment_id !== local.appointment_id) return false
  if (provider.metadata?.patient_id !== authenticatedPatientId) return false
  return provider.metadata?.payment_type === 'appointment'
}

export function isMatchingApprovedPixSubscription(
  provider: PixProviderEvidence,
  requestedPaymentId: string,
  authenticatedPatientId: string,
  localSubscription: {
    patient_id: string
    provider_subscription_id: string | null
    currency: string | null
    price_cents: number | null
  } | null,
): boolean {
  if (!localSubscription || !/^\d{1,20}$/.test(requestedPaymentId)) return false
  if (localSubscription.patient_id !== authenticatedPatientId) return false
  if (localSubscription.provider_subscription_id !== requestedPaymentId || String(provider.id) !== requestedPaymentId) return false
  if (localSubscription.currency !== 'BRL' || localSubscription.price_cents == null) return false
  if (provider.currency_id !== 'BRL' || provider.payment_method_id !== 'pix') return false
  if (provider.status !== 'approved' || !provider.date_approved) return false
  if (provider.external_reference !== 'sub:' + authenticatedPatientId) return false
  if (provider.metadata?.patient_id !== authenticatedPatientId || provider.metadata?.payment_type !== 'subscription') return false
  return majorUnitToCents(provider.transaction_amount) === localSubscription.price_cents
}
