import { describe, expect, it } from 'vitest'
import {
  classifyVerifiedPharmacyPayment, GENERAL_PHARMACY_BR_PRICE_CENTS,
  JORDAN_REFERRAL_CENTS, JORDAN_DOCTOR_FEE_CENTS, JORDAN_PRE_COST_MARGIN_CENTS,
  type LocalPharmacyPayment, type VerifiedPharmacyProviderPayment,
} from './referral-finance'

const REQUEST = '11111111-1111-4111-8111-111111111111'
const local: LocalPharmacyPayment = {
  id: '22222222-2222-4222-8222-222222222222',
  dispatch_request_id: REQUEST,
  provider_payment_id: null,
  amount_minor: GENERAL_PHARMACY_BR_PRICE_CENTS,
  currency: 'BRL',
  provider: 'mercadopago',
  status: 'pending',
}
const approved: VerifiedPharmacyProviderPayment = {
  id: '123456789012',
  status: 'approved',
  transaction_amount: 79,
  currency_id: 'BRL',
  external_reference: `pharm:${REQUEST}`,
  date_approved: '2026-11-04T12:00:00Z',
  metadata: { payment_type: 'pharmacy_consultation', dispatch_id: REQUEST },
}

describe('Jordan commercial payment proof', () => {
  it('fixes the proposed accounting amount at R$10 and checkout at R$79', () => {
    expect(GENERAL_PHARMACY_BR_PRICE_CENTS).toBe(7900)
    expect(JORDAN_REFERRAL_CENTS).toBe(1000)
    expect(JORDAN_DOCTOR_FEE_CENTS).toBe(4000)
    expect(JORDAN_PRE_COST_MARGIN_CENTS).toBe(2900)
  })
  it('accepts only PSP-approved payments with a date and exact dispatch ID', () => {
    expect(classifyVerifiedPharmacyPayment(local, approved)).toBe('approved')
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, date_approved: null })).toBeNull()
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, status: 'pending' })).toBe('pending')
  })
  it('rejects wrong currency, amount, metadata, reference and provider ID', () => {
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, currency_id: 'ARS' })).toBeNull()
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, transaction_amount: 78 })).toBeNull()
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, external_reference: 'pharm:someone-else' })).toBeNull()
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, metadata: { payment_type: 'pharmacy_consultation', dispatch_id: 'another' } })).toBeNull()
    expect(classifyVerifiedPharmacyPayment({ ...local, provider_payment_id: 'different' }, approved)).toBeNull()
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, id: 'fake-non-numeric-id' })).toBeNull()
  })
  it('voids any refunded or partially refunded sale', () => {
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, status: 'refunded' })).toBe('refunded')
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, transaction_amount_refunded: 1 })).toBe('refunded')
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, status_detail: 'partially_refunded' })).toBe('refunded')
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, status: 'charged_back' })).toBe('refunded')
  })
  it('does not award pending, rejected or cancelled payments', () => {
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, status: 'pending' })).toBe('pending')
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, status: 'rejected' })).toBe('rejected')
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, status: 'cancelled' })).toBe('cancelled')
    expect(classifyVerifiedPharmacyPayment(local, { ...approved, status: 'whatever' })).toBeNull()
  })
})
