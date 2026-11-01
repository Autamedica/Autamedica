import { describe, expect, it } from 'vitest'
import { classifyPspEvidence } from '../psp-reconciliation'

const appointmentId = '00000000-0000-4000-a000-000000000003'
const patientId = '00000000-0000-4000-a000-000000000001'
const local = {
  appointment_id: appointmentId,
  patient_id: patientId,
  provider: 'mercadopago',
  provider_payment_id: '123456789',
  currency: 'ARS',
  gross_amount: 790000,
  status: 'approved',
}
const provider = {
  id: 123456789,
  status: 'approved',
  currency_id: 'ARS',
  transaction_amount: 7900,
  external_reference: appointmentId,
  metadata: { patient_id: patientId, appointment_id: appointmentId },
}

describe('read-only PSP reconciliation evidence', () => {
  it('recognizes matching provider and database records without claiming settlement', () => {
    expect(classifyPspEvidence(local, provider)).toBe('psp_consistent')
    expect(classifyPspEvidence(local, { ...provider, external_reference: 'apt:' + appointmentId })).toBe('psp_consistent')
  })
  it('rejects incorrect owner, appointment and payment ID', () => {
    expect(classifyPspEvidence(local, { ...provider, id: 999 })).toBe('psp_mismatch')
    expect(classifyPspEvidence(local, { ...provider, external_reference: 'apt:unrelated' })).toBe('psp_mismatch')
    expect(classifyPspEvidence(local, { ...provider, metadata: { ...provider.metadata, patient_id: 'other' } })).toBe('psp_mismatch')
  })
  it('does not mix currency or minor units', () => {
    expect(classifyPspEvidence(local, { ...provider, currency_id: 'BRL' })).toBe('psp_mismatch')
    expect(classifyPspEvidence(local, { ...provider, transaction_amount: 79 })).toBe('psp_mismatch')
  })
  it('marks unresolved PSP status separately and never upgrades database state', () => {
    expect(classifyPspEvidence(local, { ...provider, status: 'pending' })).toBe('psp_pending')
    expect(classifyPspEvidence(local, { ...provider, status: 'refunded' })).toBe('psp_mismatch')
    expect(classifyPspEvidence(local, { ...provider, status_detail: 'partially_refunded' })).toBe('psp_mismatch')
    expect(classifyPspEvidence(local, { ...provider, transaction_amount_refunded: 100 })).toBe('psp_mismatch')
    expect(classifyPspEvidence({ ...local, status: 'refunded' }, { ...provider, status: 'refunded' })).toBe('psp_consistent')
    expect(classifyPspEvidence({ ...local, status: 'refunded' }, { ...provider, status: 'refunded', transaction_amount_refunded: 7900 })).toBe('psp_consistent')
  })
})
