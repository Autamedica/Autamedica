import { describe, expect, it } from 'vitest'
import { isJordanCommissionEligible } from './jordan-commission-eligibility'

const firstAcquisition = { status: 'eligible', amount_minor: 1000, currency: 'BRL' }

describe('Jordan first paid acquisition ledger', () => {
  it('recognizes only the database-approved R$10 BRL eligibility', () => {
    expect(isJordanCommissionEligible('approved', firstAcquisition)).toBe(true)
  })
  it('does not infer commission from a payment without a first-conversion ledger row', () => {
    expect(isJordanCommissionEligible('approved', null)).toBe(false)
    expect(isJordanCommissionEligible('approved', undefined)).toBe(false)
  })
  it('rejects pending, failed, refunded and cancelled payments', () => {
    for (const status of ['pending', 'initializing', 'failed', 'refunded', 'cancelled', 'rejected']) {
      expect(isJordanCommissionEligible(status, firstAcquisition)).toBe(false)
    }
  })
  it('does not mark paid or reversed rows as eligible for a new transfer', () => {
    expect(isJordanCommissionEligible('approved', { ...firstAcquisition, status: 'paid' })).toBe(false)
    expect(isJordanCommissionEligible('approved', { ...firstAcquisition, status: 'reversed' })).toBe(false)
  })
  it('rejects wrong amount or currency', () => {
    expect(isJordanCommissionEligible('approved', { ...firstAcquisition, amount_minor: 900 })).toBe(false)
    expect(isJordanCommissionEligible('approved', { ...firstAcquisition, currency: 'USD' })).toBe(false)
  })
})
