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
  it('rejects malformed and ambiguous purported subject identities', () => {
    for (const digest of [
      '0'.repeat(63),
      '0'.repeat(65),
      'Z'.repeat(64),
      '0'.repeat(63) + ' ',
      '5551987654321',
      '',
    ]) {
      expect(isVerifiedJordanCommissionEligible('approved', {
        status: 'eligible', verified_subject_hash: digest,
      })).toBe(false)
    }
  })

  it('does not infer an eligible first conversion from missing payment state', () => {
    expect(isVerifiedJordanCommissionEligible(undefined, verified)).toBe(false)
    expect(isVerifiedJordanCommissionEligible(null, verified)).toBe(false)
    expect(isVerifiedJordanCommissionEligible('initializing', verified)).toBe(false)
    expect(isVerifiedJordanCommissionEligible('approved', undefined)).toBe(false)
  })

})
