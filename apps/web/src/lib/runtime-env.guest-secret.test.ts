import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isWellFormedGuestSigningSecret,
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

  it('rejects absent, short, odd-length and non-hex secrets', () => {
    expect(isWellFormedGuestSigningSecret(undefined)).toBe(false)
    expect(isWellFormedGuestSigningSecret('')).toBe(false)
    expect(isWellFormedGuestSigningSecret('am-guest-default-fallback-secret-2026')).toBe(false)
    expect(isWellFormedGuestSigningSecret('unsafe-test-secret-too-short')).toBe(false)
    expect(isWellFormedGuestSigningSecret('change_me'.repeat(10))).toBe(false)
  })

  it('accepts correctly sized hexadecimal key material', () => {
    const exampleKey = '9d1c0b4e7a8f2d3c6b5e0a1f4d7c8b2e9a3f6c0d1e5b7a8c2f4d6e9b0a3c5f7d'
    expect(isWellFormedGuestSigningSecret(exampleKey)).toBe(true)
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
