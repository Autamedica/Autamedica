import { describe, expect, it } from 'vitest'
import {
  isMatchingApprovedPixAppointment,
  isMatchingApprovedPixSubscription,
  type LocalAppointmentPaymentEvidence,
  type PixProviderEvidence,
} from './pix-evidence'

describe('payments/pix-evidence', () => {
  const baseLocal: LocalAppointmentPaymentEvidence = {
    appointment_id: 'apt-100',
    patient_id: 'pat-1',
    provider: 'mercadopago',
    provider_payment_id: '1234567890',
    gross_amount: 14990,
    currency: 'BRL',
    status: 'pending',
  }

  const baseProvider: PixProviderEvidence = {
    id: '1234567890',
    status: 'approved',
    transaction_amount: 149.9,
    currency_id: 'BRL',
    payment_method_id: 'pix',
    external_reference: 'apt:apt-100',
    date_approved: '2026-11-19T12:00:00Z',
    metadata: {
      patient_id: 'pat-1',
      appointment_id: 'apt-100',
      payment_type: 'appointment',
    },
  }

  it('approves an exact matching BRL PIX appointment payment', () => {
    expect(isMatchingApprovedPixAppointment(baseProvider, baseLocal, '1234567890', 'pat-1')).toBe(true)
  })

  it('rejects spoofed patient, wrong amount, non-PIX method, or missing approval date', () => {
    expect(isMatchingApprovedPixAppointment(baseProvider, baseLocal, '1234567890', 'pat-other')).toBe(false)
    expect(
      isMatchingApprovedPixAppointment({ ...baseProvider, transaction_amount: 149.89 }, baseLocal, '1234567890', 'pat-1'),
    ).toBe(false)
    expect(
      isMatchingApprovedPixAppointment({ ...baseProvider, payment_method_id: 'credit_card' }, baseLocal, '1234567890', 'pat-1'),
    ).toBe(false)
    expect(
      isMatchingApprovedPixAppointment({ ...baseProvider, date_approved: null }, baseLocal, '1234567890', 'pat-1'),
    ).toBe(false)
    expect(isMatchingApprovedPixAppointment(baseProvider, null, '1234567890', 'pat-1')).toBe(false)
  })

  it('verifies BRL PIX subscription evidence and rejects mismatched external_reference or price', () => {
    const subProvider: PixProviderEvidence = {
      ...baseProvider,
      external_reference: 'sub:pat-1',
      metadata: { patient_id: 'pat-1', payment_type: 'subscription' },
    }
    const localSub = {
      patient_id: 'pat-1',
      provider_subscription_id: '1234567890',
      currency: 'BRL',
      price_cents: 14990,
    }

    expect(isMatchingApprovedPixSubscription(subProvider, '1234567890', 'pat-1', localSub)).toBe(true)
    expect(
      isMatchingApprovedPixSubscription(
        { ...subProvider, external_reference: 'sub:pat-other' },
        '1234567890',
        'pat-1',
        localSub,
      ),
    ).toBe(false)
    expect(
      isMatchingApprovedPixSubscription(subProvider, '1234567890', 'pat-1', { ...localSub, price_cents: 15000 }),
    ).toBe(false)
  })
})
