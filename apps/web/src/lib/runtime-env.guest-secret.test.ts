import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isStrongGuestSigningSecret,
  resetRuntimeEnvCache,
  resolveGuestSecret,
} from './runtime-env'

describe('guest token signing key requirements', () => {
  beforeEach(() => {
    resetRuntimeEnvCache()
    vi.stubEnv('GUEST_TOKEN_SECRET', '')
  })

  afterEach(() => {
    resetRuntimeEnvCache()
    vi.unstubAllEnvs()
  })

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

  it('resolves an explicitly configured strong runtime binding', () => {
    const runtimeKey = 'fedcba9876543210'.repeat(4)
    expect(resolveGuestSecret({ GUEST_TOKEN_SECRET: runtimeKey })).toBe(runtimeKey)
  })

  it('fails closed when the binding is missing or too weak', () => {
    expect(resolveGuestSecret({})).toBeUndefined()
    expect(resolveGuestSecret({ GUEST_TOKEN_SECRET: 'weak-secret' })).toBeUndefined()
  })
})
