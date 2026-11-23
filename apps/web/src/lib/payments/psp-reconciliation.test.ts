import { describe, expect, it } from 'vitest'
import {
  classifyPspEvidence,
  type LocalPspPayment,
  type PspPaymentEvidence,
} from './psp-reconciliation'

describe('payments/psp-reconciliation', () => {
  const baseLocal: LocalPspPayment = {
    appointment_id: 'apt-200',
    patient_id: 'pat-2',
    provider_payment_id: '987654321',
    provider: 'mercadopago',
    currency: 'ARS',
    gross_amount: 2500000,
    status: 'approved',
  }

  const basePsp: PspPaymentEvidence = {
    id: 987654321,
    status: 'approved',
    currency_id: 'ARS',
    transaction_amount: 25000,
    external_reference: 'apt:apt-200',
    metadata: { patient_id: 'pat-2', appointment_id: 'apt-200' },
  }

  it('classifies exact matching approved payment as psp_consistent', () => {
    expect(classifyPspEvidence(baseLocal, basePsp)).toBe('psp_consistent')
  })

  it('normalizes canceled -> cancelled and classifies pending/in_process as psp_pending', () => {
    expect(
      classifyPspEvidence({ ...baseLocal, status: 'cancelled' }, { ...basePsp, status: 'canceled' }),
    ).toBe('psp_consistent')
    expect(classifyPspEvidence(baseLocal, { ...basePsp, status: 'pending' })).toBe('psp_pending')
    expect(classifyPspEvidence(baseLocal, { ...basePsp, status: 'in_process' })).toBe('psp_pending')
  })

  it('flags partial refunds and unrecorded full refunds as psp_mismatch', () => {
    expect(
      classifyPspEvidence(baseLocal, { ...basePsp, status_detail: 'partially_refunded', transaction_amount_refunded: 5000 }),
    ).toBe('psp_mismatch')
    expect(
      classifyPspEvidence(baseLocal, { ...basePsp, transaction_amount_refunded: 25000 }),
    ).toBe('psp_mismatch')
    expect(
      classifyPspEvidence({ ...baseLocal, status: 'refunded' }, { ...basePsp, status: 'refunded', transaction_amount_refunded: 25000 }),
    ).toBe('psp_consistent')
  })

  it('flags currency, amount, or metadata ownership discrepancies as psp_mismatch', () => {
    expect(classifyPspEvidence(baseLocal, { ...basePsp, currency_id: 'BRL' })).toBe('psp_mismatch')
    expect(classifyPspEvidence(baseLocal, { ...basePsp, transaction_amount: 24999 })).toBe('psp_mismatch')
    expect(
      classifyPspEvidence(baseLocal, { ...basePsp, metadata: { patient_id: 'pat-other', appointment_id: 'apt-200' } }),
    ).toBe('psp_mismatch')
  })
})
