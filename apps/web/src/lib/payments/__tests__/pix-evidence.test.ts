import { describe, expect, it } from 'vitest'
import { isMatchingApprovedPixAppointment, isMatchingApprovedPixSubscription } from '../pix-evidence'

const patientId = '00000000-0000-4000-a000-000000000001'
const otherPatientId = '00000000-0000-4000-a000-000000000002'
const appointmentId = '00000000-0000-4000-a000-000000000003'
const paymentId = '123456789'

const local = {
  appointment_id: appointmentId,
  patient_id: patientId,
  provider: 'mercadopago',
  provider_payment_id: paymentId,
  currency: 'BRL',
  gross_amount: 7900,
  status: 'pending',
}

const provider = {
  id: Number(paymentId),
  status: 'approved',
  transaction_amount: 79,
  currency_id: 'BRL',
  payment_method_id: 'pix',
  external_reference: 'apt:' + appointmentId,
  date_approved: '2026-11-01T04:00:00Z',
  metadata: { patient_id: patientId, appointment_id: appointmentId, payment_type: 'appointment' },
}

describe('PIX payment evidence gate', () => {
  it('accepts only a paid matching local appointment', () => {
    expect(isMatchingApprovedPixAppointment(provider, local, paymentId, patientId)).toBe(true)
  })

  it('rejects missing local payment; bare apt: is NOT authorization', () => {
    expect(isMatchingApprovedPixAppointment(provider, null, paymentId, patientId)).toBe(false)
  })

  it('rejects a payment for another patient', () => {
    expect(isMatchingApprovedPixAppointment(provider, local, paymentId, otherPatientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment({ ...provider, metadata: { ...provider.metadata, patient_id: otherPatientId } }, local, paymentId, patientId)).toBe(false)
  })

  it('rejects forged/mismatched reference and payment IDs', () => {
    expect(isMatchingApprovedPixAppointment({ ...provider, external_reference: 'apt:' + otherPatientId }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment({ ...provider, metadata: { ...provider.metadata, appointment_id: otherPatientId } }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment({ ...provider, id: 999 }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment(provider, { ...local, provider_payment_id: '999' }, paymentId, patientId)).toBe(false)
  })

  it('rejects mismatched currency, amount and payment method', () => {
    expect(isMatchingApprovedPixAppointment({ ...provider, currency_id: 'ARS' }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment({ ...provider, transaction_amount: 1 }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment({ ...provider, payment_method_id: 'credit_card' }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment(provider, { ...local, currency: 'ARS' }, paymentId, patientId)).toBe(false)
  })

  it('rejects unapproved, missing evidence and invalid provider IDs', () => {
    expect(isMatchingApprovedPixAppointment({ ...provider, status: 'pending' }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment({ ...provider, date_approved: null }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment({ ...provider, metadata: undefined }, local, paymentId, patientId)).toBe(false)
    expect(isMatchingApprovedPixAppointment(provider, local, '../1', patientId)).toBe(false)
  })

  it('requires subscription ownership and exact local provider reference', () => {
    const sub = { patient_id: patientId, provider_subscription_id: paymentId, currency: 'BRL', price_cents: 4990 }
    const mp = { ...provider, transaction_amount: 49.9, external_reference: 'sub:' + patientId,
      metadata: { patient_id: patientId, payment_type: 'subscription' } }
    expect(isMatchingApprovedPixSubscription(mp, paymentId, patientId, sub)).toBe(true)
    expect(isMatchingApprovedPixSubscription(mp, paymentId, otherPatientId, sub)).toBe(false)
    expect(isMatchingApprovedPixSubscription(mp, paymentId, patientId, { ...sub, provider_subscription_id: '5555' })).toBe(false)
    expect(isMatchingApprovedPixSubscription({ ...mp, transaction_amount: 1 }, paymentId, patientId, sub)).toBe(false)
  })
})
