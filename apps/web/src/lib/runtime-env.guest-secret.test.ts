import { describe, expect, it } from 'vitest'
import { isStrongGuestSigningSecret } from './runtime-env'

describe('guest token signing key requirements', () => {
  it('rejects absent, short and non-random-looking secrets', () => {
    expect(isStrongGuestSigningSecret(undefined)).toBe(false)
    expect(isStrongGuestSigningSecret('')).toBe(false)
    expect(isStrongGuestSigningSecret('am-guest-default-fallback-secret-2026')).toBe(false)
    expect(isStrongGuestSigningSecret('unsafe-test-secret-too-short')).toBe(false)
    expect(isStrongGuestSigningSecret('change_me'.repeat(10))).toBe(false)
  })

  it('accepts a 256-bit hex key produced by a cryptographic generator', () => {
    const exampleKey = '0123456789abcdef'.repeat(4)
    expect(isStrongGuestSigningSecret(exampleKey)).toBe(true)
  })
})
