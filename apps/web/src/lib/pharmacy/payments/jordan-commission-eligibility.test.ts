import { describe, expect, it } from 'vitest'
import { isVerifiedJordanCommissionEligible } from './jordan-commission-eligibility'

const verified = {
  status: 'eligible',
  verified_subject_hash: 'a'.repeat(64),
}

describe('Jordan first verified conversion reporting', () => {
  it('never awards commission from payment approval alone', () => {
    expect(isVerifiedJordanCommissionEligible('approved', null)).toBe(false)
    expect(isVerifiedJordanCommissionEligible('approved', {
      status: 'eligible', verified_subject_hash: null,
    })).toBe(false)
    expect(isVerifiedJordanCommissionEligible('approved', {
      status: 'eligible', verified_subject_hash: 'guest-phone-number',
    })).toBe(false)
  })

  it('refuses pending, rejected, cancelled and refunded payments', () => {
    for (const status of ['pending', 'rejected', 'cancelled', 'refunded', 'failed']) {
      expect(isVerifiedJordanCommissionEligible(status, verified)).toBe(false)
    }
  })

  it('requires exact provider-approved state and an eligible verified ledger row', () => {
    expect(isVerifiedJordanCommissionEligible('approved', verified)).toBe(true)
    expect(isVerifiedJordanCommissionEligible('approved', {
      ...verified, status: 'reversed',
    })).toBe(false)
    expect(isVerifiedJordanCommissionEligible('approved', {
      ...verified, verified_subject_hash: 'A'.repeat(64),
    })).toBe(false)
  })
})
